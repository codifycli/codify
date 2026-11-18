// @types/react 19 removed the global JSX namespace. ink-spinner (a dependency of @assistant-ui/react-ink) still
// types its component as returning `JSX.Element`; this alias lets its typings check without skipLibCheck.
import type React from 'react';

declare global {
  namespace JSX {
    type Element = React.JSX.Element;
  }
}
