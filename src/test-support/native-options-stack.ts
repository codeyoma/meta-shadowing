import React from 'react';
import type { nativeHooks } from './native-hooks';

/** Substitute only native navigation. Production page bodies and focus synchronization still execute. */
export function nativeOptionsStack(hooks: ReturnType<typeof nativeHooks>['hooks']) {
  function Navigator({ children, initialRouteName, screenOptions }: any) {
    const [routes, setRoutes] = hooks.useState(() => [{ name: initialRouteName, params: undefined }]);
    const navigation = hooks.useMemo(() => ({
      navigate: (name: string, params?: unknown) => setRoutes((previous: any[]) => [...previous, { name, params }]),
      popToTop: () => setRoutes((previous: any[]) => previous.slice(0, 1)),
      replace: (name: string, params?: unknown) => setRoutes((previous: any[]) => [...previous.slice(0, -1), { name, params }]),
      getState: () => ({ index: routes.length - 1 }),
    }), [routes]);
    const route = routes.at(-1);
    const screen = React.Children.toArray(children).find((child: any) => child.props.name === route.name) as React.ReactElement<any>;
    return React.createElement('NativeOptionsStack', { screenOptions, navigation }, screen.props.children({ navigation, route }));
  }
  return { createNativeStackNavigator: () => ({ Navigator, Screen: 'NativeOptionsScreen' }) };
}
