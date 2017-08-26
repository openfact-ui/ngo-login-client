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

  // Keycloak utils
  public isAuthenticated: boolean;

  // Keycloak location
  private apiUrl: string;
  private ssoUrl: string;
  private realm: string;

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

      console.log('APP: authentication status changed...');

      if (this.isAuthenticated) {
        // make sure old tokens are cleared out when we login again
        localStorage.setItem('auth_token', this.getAccessToken());
        localStorage.setItem('refresh_token', this.getRefreshToken());

        this.onLogIn();
      }
    });

  }

  /**
   * Call to KC login
   * @param options
   */
  public logIn(options?: any): void {
    Keycloak.login(options);
  }

  protected onLogIn() {
    this.broadcaster.broadcast('loggedin', 1);
  }

  /**
   * Broadcast logout, clear session data and call KC logout
   * @param options
   */
  public logout(options?: any) {
    this.clearSessionData();
    this.broadcaster.broadcast('logout', 1);
    Keycloak.logout(options);
  }

  /**
   * Return true if user has already been autheticates
   */
  isLoggedIn(): boolean {
    return this.isAuthenticated;
  }

  getAccessToken() {
    if (this.isLoggedIn()) return Keycloak.accessToken;
  }

  getRefreshToken(): string {
    if (this.isLoggedIn()) return Keycloak.refreshToken;
  }

  isRefreshTokenOffline(): boolean {
    if (this.isLoggedIn()) return Keycloak.refreshTokenParsed.typ === 'Offline';
  }

  /**
   * Return Google token
   */
  getGoogleToken(): Observable<string> {
    if (this.isLoggedIn()) {
      return this.createFederatedToken(this.google, (response: Response) => response.json() as Token);
    }
  }

  /**
   * Return Microsoft token
   */
  getMicrosoftToken(): Observable<string> {
    if (this.isLoggedIn()) {
      return this.createFederatedToken(this.microsoft, (response: Response) => response.json() as Token);
    }
  }

  /**
   * Create Federated Token
   * @param broker
   * @param processToken
   */
  private createFederatedToken(broker: string, processToken: ProcessTokenResponse): Observable<string> {
    let headers = new Headers({ 'Content-Type': 'application/json' });
    let tokenUrl = this.ssoUrl + `auth/realms/${this.realm}/broker/${broker}/token`;
    headers.set('Authorization', `Bearer ${this.getAccessToken()}`);
    let options = new RequestOptions({ headers: headers });
    return this.http.get(tokenUrl, options)
      .map(response => processToken(response))
      .catch(response => {
        if (response.status === 400) {
          this.broadcaster.broadcast('noFederatedToken', response);
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
