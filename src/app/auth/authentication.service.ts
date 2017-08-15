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

  public offlineRefreshToken: string;

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

      if (Keycloak.refreshTokenParsed.typ === 'Offline') {
        this.offlineRefreshToken = Keycloak.refreshToken;
      }

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

    this.googleToken = this.createFederatedToken(this.google, (response: Response) => response.json() as Token);
    this.microsoftToken = this.createFederatedToken(this.microsoft, (response: Response) => response.json() as Token);
  }

  logIn(options?: any): void {
    Keycloak.login(options);
  }

  onLogIn() {
    console.log('User have just loggedin');
    this.broadcaster.broadcast('loggedin', 1);
  }

  logout(options?: any) {
    this.broadcaster.broadcast('logout', 1);
    Keycloak.logout(options);
  }

  isLoggedIn(): boolean {
    if (this.isAuthenticated) {
      if (!this.clearTimeoutId) {
        // kick off initial token refresh
        this.refreshTokens.next({ 'access_token': this.accessToken } as Token);
        this.setupRefreshTimer(15);
      }
      return true;
    }
    return false;
  }

  isOfflineToken(): boolean {
    return Keycloak.refreshTokenParsed.typ === 'Offline';
  }

  getOfflineRefreshToken() {
    return this.offlineRefreshToken;
  }

  getToken() {
    if (this.isLoggedIn()) return this.accessToken;
  }

  getRefreshToken(): string {
    return Keycloak.refreshToken;
  }

  getGoogleToken(): Observable<string> {
    if (localStorage.getItem(this.google + '_token')) {
      return Observable.of(localStorage.getItem(this.google + '_token'));
    }
    return this.googleToken;
  }

  getMicrosoftToken(): Observable<string> {
    if (localStorage.getItem(this.microsoft + '_token')) {
      return Observable.of(localStorage.getItem(this.microsoft + '_token'));
    }
    return this.microsoftToken;
  }

  setupRefreshTimer(refreshInSeconds: number) {
    if (!this.clearTimeoutId) {
      // refresh should be required to be less than ten minutes measured in seconds
      let tenMinutes = 60 * 10;
      if (refreshInSeconds > tenMinutes) {
        refreshInSeconds = tenMinutes;
      }
      let refreshInMs = Math.round(refreshInSeconds * .9) * 1000;
      console.log('Refreshing token in: ' + refreshInMs + ' milliseconds.');
      this.refreshInterval = refreshInMs;
      if (process.env.ENV !== 'inmemory') {
        // setTimeout() uses a 32 bit int to store the delay. So the max value allowed is 2147483647
        // The bigger number will cause immediate refreshing
        // but since we refresh in 10 minutes or in refreshInSeconds whatever is sooner we are good
        this.clearTimeoutId = setTimeout(() => this.refreshToken(), refreshInMs);
      }
    }
  }

  refreshToken() {
    if (this.isLoggedIn()) {
      this.refreshTokens.next(({ 'access_token': this.accessToken } as Token));
    }
  }

  private createFederatedToken(broker: string, processToken: ProcessTokenResponse): Observable<string> {
    let res = this.refreshTokens.switchMap((token) => {
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
        .do((token) => localStorage.setItem(broker + '_token', token.access_token))
        .map(t => t.access_token);
    }).publishReplay(1);

    res.connect();
    return res;
  }

}
