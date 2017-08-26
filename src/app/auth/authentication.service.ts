import { UserService } from './../user/user.service';
import { Token } from '../user/token';
import { Observable } from 'rxjs/Observable';
import { Subject } from 'rxjs/Subject';

import { Injectable, Inject } from '@angular/core';
import { Http, Response, Headers, RequestOptions } from '@angular/http';

import { Broadcaster } from 'ngo-base';

import { AUTH_API_URL } from '../shared/auth-api';
import { SSO_API_URL } from '../shared/sso-api';
import { REALM } from '../shared/realm-token';
import { Keycloak } from '@ebondu/angular2-keycloak';

export interface ProcessTokenResponse {
  (response: Response): Token;
}

@Injectable()
export class AuthenticationService {

  // Tokens
  readonly google = 'google';
  readonly microsoft = 'microsoft';
  public googleToken: Observable<string>;
  public microsoftToken: Observable<string>;

  // Keycloak utils
  public parsedToken: any;
  public accessToken: string;
  public isAuthenticated: boolean;
  public profile: any;

  private apiUrl: string;
  private ssoUrl: string;
  private realm: string;

  // Tokens config
  private refreshInterval: number;
  private clearTimeoutId: any;
  private refreshTokens: Subject<Token> = new Subject();

  private KC_APP_INITIALIZED_OBS = 'kc_initialization';

  constructor(
    private broadcaster: Broadcaster,
    @Inject(AUTH_API_URL) apiUrl: string,
    @Inject(SSO_API_URL) ssoUrl: string,
    @Inject(REALM) realm: string,
    private http: Http,
    private userService: UserService,
    private keycloak: Keycloak) {

    this.apiUrl = apiUrl;
    this.ssoUrl = ssoUrl;
    this.realm = realm;

    Keycloak.authenticatedObs.subscribe(auth => {
      this.isAuthenticated = auth;
      this.parsedToken = Keycloak.tokenParsed;
      this.accessToken = Keycloak.accessToken;

      console.log('APP: authentication status changed...');

      if (this.isAuthenticated) {
        let token = this.parsedToken;

        let expiresIn = Keycloak.tokenParsed['exp'] - (new Date().getTime() / 1000) + Keycloak.timeSkew;
        this.setupRefreshTimer(expiresIn);

        // make sure old tokens are cleared out when we login again
        localStorage.removeItem(this.google + '_token');
        localStorage.removeItem(this.microsoft + '_token');

        // kick off initial token refresh
        this.refreshTokens.next({ 'access_token': this.accessToken } as Token);

        this.onLogIn();
      }
    });

    Keycloak.initializedObs.subscribe((result) => {
      if (result) {
        const appInitialization = localStorage.getItem(this.KC_APP_INITIALIZED_OBS);
        localStorage.removeItem(this.KC_APP_INITIALIZED_OBS);
        if (appInitialization) {
          this.broadcaster.broadcast('appinitialized', true);
        } else {
          localStorage.setItem(this.KC_APP_INITIALIZED_OBS, 'preInitialization');
          broadcaster.broadcast('appinitialized', false);
        }
      }
    });

  }

  logIn(options?: any): void {
    Keycloak.login(options);
  }

  onLogIn() {
    console.log('User have just loggedin');
    this.broadcaster.broadcast('loggedin', 1);
  }

  /**
   * Broadcast logout, clear session data and call KC logout
   * @param options
   */
  logout(options?: any) {
    this.broadcaster.broadcast('logout', 1);
    this.clearSessionData();
    Keycloak.logout(options);
  }

  /**
   * Return true if user has already been autheticates
   */
  isLoggedIn(): boolean {
    return this.isAuthenticated;
  }

  isOfflineToken(): boolean {
    return Keycloak.refreshTokenParsed.typ === 'Offline';
  }

  getAccessToken() {
    if (this.isLoggedIn()) return this.accessToken;
  }

  getRefreshToken(): string {
    return Keycloak.refreshToken;
  }

  /**
   * Return Google token
   */
  getGoogleToken(): Observable<string> {
    return this.createFederatedToken(this.google, (response: Response) => response.json() as Token);
  }

  /**
   * Return Microsoft token
   */
  getMicrosoftToken(): Observable<string> {
    return this.createFederatedToken(this.microsoft, (response: Response) => response.json() as Token);
  }

  private createFederatedToken(broker: string, processToken: ProcessTokenResponse): Observable<string> {
    let headers = new Headers({ 'Content-Type': 'application/json' });
    let tokenUrl = this.ssoUrl + `auth/realms/${this.realm}/broker/${broker}/token`;
    headers.set('Authorization', `Bearer ${token.access_token}`);
    let options = new RequestOptions({ headers: headers });
    return this.http.get(tokenUrl, options)
      .map(response => processToken(response))
      .catch(response => {
        if (response.status === 400) {
          this.broadcaster.broadcast('noFederatedToken', res);
        }
        return Observable.of({} as Token);
      })
      .map(t => t.access_token);
  }

  private clearSessionData(): void {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
  }

}
