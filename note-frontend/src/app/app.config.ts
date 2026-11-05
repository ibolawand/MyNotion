import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';

import { routes } from './app.routes';
import { provideHttpClient } from '@angular/common/http';
import { AuthService } from './Auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAppInitializer(() => {
      const authService = inject(AuthService)
      return authService.checkAuthState()
    }),
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    // Hash URLs (#/calendar) work when the packaged app loads index.html from disk;
    // normal paths would point at file:///calendar.
    provideRouter(routes, withHashLocation()),
    provideHttpClient(),
    AuthService,
  ]
};
