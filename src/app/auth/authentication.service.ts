import { Injectable, Inject } from '@angular/core';
import { Http } from '@angular/http';

import { Broadcaster } from 'ngo-base';

import { AUTH_API_URL } from '../shared/auth-api';
import { SSO_API_URL } from '../shared/sso-api';
import { REALM } from '../shared/realm-token';
import { Keycloak } from '@ebondu/angular2-keycloak';

@Injectable()
export class AuthenticationService {

  public parsedToken: any;
  public isAuthenticated: boolean;
  public profile: any;

  private apiUrl: string;
  private ssoUrl: string;
  private realm: string;

  constructor(
    private broadcaster: Broadcaster,
    @Inject(AUTH_API_URL) apiUrl: string,
    @Inject(SSO_API_URL) ssoUrl: string,
    @Inject(REALM) realm: string,
    private http: Http,
    private keycloak: Keycloak) {
    this.apiUrl = apiUrl;
    this.ssoUrl = ssoUrl;
    this.realm = realm;

    Keycloak.authenticatedObs.subscribe(auth => {
      this.isAuthenticated = auth;
      this.parsedToken = Keycloak.tokenParsed;

      console.log('APP: authentication status changed...');
    });
    this.keycloak.init({});
  }

  logIn(options?: string): boolean {
    Keycloak.login(options);

    this.onLogIn();
    return true;
  }

  onLogIn() {
    this.broadcaster.broadcast('loggedin', 1);
  }

  logout(options?: any) {
    Keycloak.logout(options);
    this.broadcaster.broadcast('logout', 1);
  }

  isLoggedIn(): boolean {
    return this.isAuthenticated;
  }

  getToken() {
    if (this.isLoggedIn()) return this.parsedToken;
  }

}
