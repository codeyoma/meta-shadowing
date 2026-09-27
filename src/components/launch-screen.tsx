import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, View } from 'react-native';
import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useReducedMotion } from 'react-native-reanimated';
import { playLaunchHaptics, prepareLaunchHaptics, stopLaunchHaptics } from '@/native/launch-haptics';

// The supplied WebP has 17 frames totaling 2.4 seconds. Keep it unmodified.
const cycleDuration = 2400;

export function LaunchScreen({ ready, children }: PropsWithChildren<{ ready: boolean }>) {
  const image = useRef<Image>(null);
  const reducedMotion = useReducedMotion();
  const [puppyDisplayed, setPuppyDisplayed] = useState(false);
  const [wordmarkReady, setWordmarkReady] = useState(false);
  const displayed = puppyDisplayed && wordmarkReady;
  const [finished, setFinished] = useState(reducedMotion);
  const nativeHidden = useRef(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const wasActive = useRef(active);
  const interrupted = useRef(false);
  const visible = !ready || !finished;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      const foreground = state === 'active';
      setActive(foreground);
      if (foreground) wasActive.current = true;
      else {
        stopLaunchHaptics();
        if (wasActive.current) {
          interrupted.current = true;
          setFinished(true);
        }
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!active || finished || reducedMotion) return;
    prepareLaunchHaptics();
    return stopLaunchHaptics;
  }, [active, finished, reducedMotion]);

  useEffect(() => {
    if ((displayed || !visible) && !nativeHidden.current) {
      nativeHidden.current = true;
      SplashScreen.hide();
    }
  }, [displayed, visible]);

  useEffect(() => {
    if (finished) return;
    if (reducedMotion) { setFinished(true); return; }
    if (!active || !displayed || !image.current) return;
    const player = image.current;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void player.startAnimating().then(() => {
      if (cancelled || interrupted.current || AppState.currentState !== 'active') {
        void player.stopAnimating().catch(() => {}); return;
      }
      playLaunchHaptics();
      timer = setTimeout(() => setFinished(true), cycleDuration);
    }).catch(() => { if (!cancelled) setFinished(true); });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      stopLaunchHaptics();
      void player.stopAnimating().catch(() => {});
    };
  }, [active, displayed, finished, reducedMotion]);

  useEffect(() => {
    if (finished || displayed) return;
    // A missing image callback must never leave the ready app behind a splash.
    const timer = setTimeout(() => setFinished(true), 5000);
    return () => clearTimeout(timer);
  }, [displayed, finished]);

  return <View style={{ flex: 1 }}>
    <View style={{ flex: 1 }} pointerEvents={visible ? 'none' : 'auto'} accessibilityElementsHidden={visible}>
      {ready ? children : null}
    </View>
    <StatusBar style={visible ? 'dark' : 'auto'} />
    {visible && <View accessibilityRole="image" accessibilityLabel="쇄도잉"
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
        backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
      <Image ref={image} source={require('../../assets/brand/talking-pup-512.webp')}
        style={{ width: 160, height: 160 }} contentFit="contain" autoplay={false}
        useAppleWebpCodec={false} transition={0}
        onDisplay={() => setPuppyDisplayed(true)} onError={() => setFinished(true)} />
      <Image source={require('../../assets/brand/launch-wordmark.png')}
        // Match the native storyboard's screen-relative offset, including before safe areas settle.
        style={{ position: 'absolute', bottom: 58, alignSelf: 'center', width: 220, height: 220 * 2 / 3 }}
        contentFit="contain" transition={0} accessible={false}
        onDisplay={() => setWordmarkReady(true)} onError={() => setWordmarkReady(true)} />
    </View>}
  </View>;
}
