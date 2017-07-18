import {Injectable, Inject, forwardRef} from '@angular/core';
import {
  Response,
  RequestOptionsArgs,
  RequestOptions,
  Request,
  ConnectionBackend
} from '@angular/http';

import {Observable} from 'rxjs/Observable';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/catch';
import 'rxjs/add/observable/of';

import {Broadcaster} from 'ngo-base';

import {Keycloak, KeycloakHttp, KeycloakAuthorization} from '@ebondu/angular2-keycloak';

@Injectable()
export class HttpService extends KeycloakHttp {

  private broadcaster: Broadcaster;

  constructor(backend: ConnectionBackend,
              defaultOptions: RequestOptions,
              keycloak: Keycloak,
              keycloakAuth: KeycloakAuthorization,
              @Inject(forwardRef(() => Broadcaster)) broadcaster: Broadcaster) {
    super(backend, defaultOptions, keycloak, keycloakAuth);
    this.broadcaster = broadcaster;
  }

  request(url: string | Request, options?: RequestOptionsArgs): Observable<Response> {
    return super.request(url, options).catch(this.catchRequestError());
  }

  private catchRequestError() {
    return (res: Response) => {
      if (res.status === 401 || res.status === 403) {
        this.broadcaster.broadcast('authenticationError', res);
      } else if (res.status === 500) {
        this.broadcaster.broadcast('communicationError', res);
      }
      return Observable.throw(res);
    };
  }
}
