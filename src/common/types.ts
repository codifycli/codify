/* eslint no-use-before-define: 0 */
export type NonMethodKeys<T> = {
  [key in keyof T]: T[key] extends Function ? never : key
}[keyof T];
export type RemoveMethods<T> = Pick<T, NonMethodKeys<T>>;

export type RemoveErrorMethods<T> = Omit<RemoveMethods<T>, 'name'>;
/* eslint no-use-before-define: 2 */
