import { Injectable, Inject } from '@angular/core';
import { Http, Response, Headers, RequestOptions, RequestOptionsArgs } from '@angular/http';

import { Observable, Subject } from 'rxjs';
import { Broadcaster } from 'ngo-base';

import { AUTH_API_URL } from '../shared/auth-api';
import { SSO_API_URL } from '../shared/sso-api';
import { REALM } from '../shared/realm-token';
import { Token } from '../user/token';

export interface ProcessTokenResponse {
  (response: Response): Token;
}

@Injectable()
export class AuthenticationService {

  // Tokens
  readonly google = 'google';
  readonly microsoft = 'microsoft';

  private refreshInterval: number;
  private apiUrl: string;
  private ssoUrl: string;
  private realm: string;
  private clearTimeoutId: any;
  private refreshTokens: Subject<Token> = new Subject();

  constructor(
    private broadcaster: Broadcaster,
    @Inject(AUTH_API_URL) apiUrl: string,
    @Inject(SSO_API_URL) ssoUrl: string,
    @Inject(REALM) realm: string,
    private http: Http
  ) {
    this.apiUrl = apiUrl;
    this.ssoUrl = ssoUrl;
    this.realm = realm;
  }

  logIn(tokenParameter: string): boolean {
    let tokenJson = decodeURIComponent(tokenParameter);
    let token = this.processTokenResponse(JSON.parse(tokenJson));
    this.setupRefreshTimer(token.expires_in);

    // kick off initial token refresh
    this.refreshTokens.next(token);

    this.onLogIn();
    return true;
  }

  onLogIn() {
    this.broadcaster.broadcast('loggedin', 1);
  }

  logout() {
    this.clearSessionData();
    this.broadcaster.broadcast('logout', 1);
  }

  isLoggedIn(): boolean {
    let token = localStorage.getItem('auth_token');
    if (token) {
      if (!this.clearTimeoutId) {
        // kick off initial token refresh
        this.refreshTokens.next({ "access_token": token } as Token);
        this.setupRefreshTimer(15);
      }
      return true;
    }
    return false;
  }

  getToken() {
    if (this.isLoggedIn()) return localStorage.getItem('auth_token');
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
      let headers = new Headers({ 'Content-Type': 'application/json' });
      let options: RequestOptions = new RequestOptions({ headers: headers });
      let refreshTokenUrl = this.apiUrl + 'login/refresh';
      let refreshToken = localStorage.getItem('refresh_token');
      let body = JSON.stringify({ 'refresh_token': refreshToken });
      this.http.post(refreshTokenUrl, body, options)
        .map((response: Response) => {
          let responseJson = response.json();
          let token = this.processTokenResponse(responseJson.token);
          this.clearTimeoutId = null;
          this.setupRefreshTimer(token.expires_in);
          return token;
        })
        .catch(response => {
          // Additionally catch a 400 from keycloak
          if (response.status === 400) {
            this.broadcaster.broadcast('authenticationError', response);
          }
          return Observable.of({} as Token);
        })
        .subscribe(token => {
          // Refresh any federated tokens that we have
          this.refreshTokens.next(token);
          console.log('token refreshed at:' + Date.now());
        });
    }
  }

  processTokenResponse(response: any): Token {
    let token = response as Token;
    localStorage.setItem('auth_token', token.access_token);
    localStorage.setItem('refresh_token', token.refresh_token);
    return token;
  }

  private createFederatedToken(broker: string, processToken: ProcessTokenResponse): Observable<string> {
    let headers = new Headers({ 'Content-Type': 'application/json' });
    let tokenUrl = this.ssoUrl + `auth/realms/${this.realm}/broker/${broker}/token`;
    headers.set('Authorization', `Bearer ${this.getToken()}`);
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

  private queryAsToken(query: string): Token {
    let vars = query.split('&');
    let token = {} as any;
    for (let i = 0; i < vars.length; i++) {
      let pair = vars[i].split('=');
      let key = decodeURIComponent(pair[0]);
      let val = decodeURIComponent(pair[1]);
      token[key] = val;
    }
    return token as Token;
  }

  private clearSessionData(): void {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    clearTimeout(this.clearTimeoutId);
    this.refreshInterval = null;
  }
}
