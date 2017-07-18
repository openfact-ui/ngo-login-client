import { NgModule } from '@angular/core';
import { HttpModule } from '@angular/http';

import { OfUserName } from './src/app/user/of-user-name.pipe';

@NgModule({
  imports: [
    HttpModule
  ],
  declarations: [
    OfUserName
  ],
  exports: [
    OfUserName
  ]
})
export class LoginModule {
  // static forRoot(providedLoader: any = {
  //   provide: TranslateLoader,
  //   useFactory: translateLoaderFactory,
  //   deps: [Http]
  // }): ModuleWithProviders {
  //   return {
  //     ngModule: WidgetsModule,
  //     providers: [
  //       providedLoader,
  //       TranslateService,
  //       { provide: TranslateParser, useClass: DefaultTranslateParser }
  //     ]
  //   };
  // }
}
