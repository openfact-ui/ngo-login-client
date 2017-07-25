import { Injectable, Inject } from '@angular/core';
import { Headers, Http } from '@angular/http';

import {
  Observable,
  ConnectableObservable,
  ReplaySubject,
  Subject
} from 'rxjs';

import { cloneDeep } from 'lodash';
import { Broadcaster, Logger } from 'ngo-base';

import { AUTH_API_URL } from '../shared/auth-api';
import { User } from './user';

/**
 *  Provides user and user list methods to retrieve current or user list details
 *
 *  The UserService should be injected at the root of the application to ensure it is a singleton
 *  getUser and getAllUsers return observables that can be subscribed to for information
 */
@Injectable()
export class UserService {

  /**
   * The currently logged in user
   */
  public loggedInUser: ConnectableObservable<User>;

  private headers = new Headers({ 'Content-Type': 'application/json' });
  private userUrl: string;  // URL to web api
  private usersUrl: string;  // URL to web api
  private searchUrl: string;

  constructor(
    private http: Http,
    private logger: Logger,
    broadcaster: Broadcaster,
    @Inject(AUTH_API_URL) apiUrl: string) {
    this.userUrl = apiUrl + 'user';
    this.usersUrl = apiUrl + 'users';
    this.searchUrl = apiUrl + 'search';
    this.loggedInUser = Observable.merge(
      broadcaster.on('loggedin').map(val => 'loggedIn'),
      broadcaster.on('logout').map(val => 'loggedOut'),
      broadcaster.on('authenticationError').map(val => 'authenticationError')
    ).switchMap(val => {
      console.log('ooooooooooooooooooooooooooooooooooooooooooooooooo');

      // If it's a login event, then we need to retreive the user's details
      if (val === 'loggedIn') {
        return this.http
          .get(this.userUrl, { headers: this.headers })
          .map(response => cloneDeep(response.json().data as User));
      } else {
        // Otherwise, we clear the user
        return Observable.of({} as User);
      }
    })
      // In order to ensure any future subscribers get the currently user
      // we use a replay subject of size 1
      .multicast(() => new ReplaySubject(1));
    this.loggedInUser.connect();
  }

  /**
   * Get the User object for a given user id, or null if no user is found
   * @param userId the userId to search for
   */
  getUserByUserId(userId: string): Observable<User> {
    return this.http
      .get(`${this.usersUrl}/${userId}`, { headers: this.headers })
      .map(response => {
        return response.json().data as User;
      });
  }

  /**
   * Get the User object for a given username, or null if no user is found
   * @param username the username to search for
   */
  getUserByUsername(username: string): Observable<User> {
    return this.filterUsersByUsername(username).map(val => {
      for (let u of val) {
        if (username === u.attributes.username) {
          return u;
        }
      }
      return null;
    });
  }

  /**
   * Get users by a search string
   */
  getUsersBySearchString(search: string): Observable<User[]> {
    if (search && search !== '') {
      return this.http
        .get(this.searchUrl + '/users?q=' + search, { headers: this.headers })
        .map(response => {
          return response.json().data as User[];
        });
    }
    return Observable.of([] as User[]);
  }

  /**
   *
   * Filter users by username
   *
   * @returns Observable<User[]>
   */

  filterUsersByUsername(username: string): Observable<User[]> {
    return this.http
      .get(`${this.usersUrl}?filter[username]=${username}`, { headers: this.headers })
      .map(response => {
        return response.json().data as User[];
      });
  }

}
