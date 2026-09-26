import React from 'react';
import type { nativeHooks } from './native-hooks';

/** Substitute only native navigation. Production page bodies and focus synchronization still execute. */
export function nativeOptionsStack(hooks: ReturnType<typeof nativeHooks>['hooks']) {
  function Navigator({ children, initialRouteName, screenOptions }: any) {
    const [routes, setRoutes] = hooks.useState(() => [initialRouteName]);
    const navigation = hooks.useMemo(() => ({
      navigate: (name: string) => setRoutes((previous: string[]) => [...previous, name]),
      popToTop: () => setRoutes((previous: string[]) => previous.slice(0, 1)),
      replace: (name: string) => setRoutes((previous: string[]) => [...previous.slice(0, -1), name]),
      getState: () => ({ index: routes.length - 1 }),
    }), [routes]);
    const route = React.Children.toArray(children).find((child: any) => child.props.name === routes.at(-1)) as React.ReactElement<any>;
    return React.createElement('NativeOptionsStack', { screenOptions }, route.props.children({ navigation }));
  }
  return { createNativeStackNavigator: () => ({ Navigator, Screen: 'NativeOptionsScreen' }) };
}
