import { useRef, useState } from 'react';
import { ActivityIndicator, Animated, PanResponder, StyleSheet, Text, View } from 'react-native';

const THRESHOLD = 70;

interface Props {
  isLoading: boolean;
  onApprove: () => void; // 左スワイプ = 合格
  onZap: () => void; // 右スワイプ = 不合格
}

export function SwipeJudgeControl({ isLoading, onApprove, onZap }: Props) {
  const offset = useRef(new Animated.Value(0)).current;
  const [progress, setProgress] = useState(0);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => !isLoading,
      onPanResponderMove: (_, gesture) => {
        offset.setValue(gesture.dx);
        setProgress(Math.min(1, Math.max(-1, gesture.dx / THRESHOLD)));
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.vx < -0.3 || gesture.dx < -THRESHOLD) {
          onApprove();
        } else if (gesture.vx > 0.3 || gesture.dx > THRESHOLD) {
          onZap();
        }
        Animated.spring(offset, { toValue: 0, useNativeDriver: false }).start();
        setProgress(0);
      },
    })
  ).current;

  const backgroundColor =
    progress < 0
      ? `rgba(46, 125, 50, ${-progress * 0.85})`
      : progress > 0
        ? `rgba(211, 47, 47, ${progress * 0.85})`
        : 'transparent';

  const leftColor = progress < 0 ? '#fff' : '#2e7d32';
  const rightColor = progress > 0 ? '#fff' : '#d32f2f';
  const leftOpacity = progress < 0 ? -progress : 0.5;
  const rightOpacity = progress > 0 ? progress : 0.5;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor, borderColor: progress === 0 ? '#ccc' : 'transparent' },
      ]}
      {...panResponder.panHandlers}
    >
      <View style={styles.labelRow}>
        <Text style={[styles.label, { opacity: leftOpacity, color: leftColor }]}>✓ 合格</Text>
        <Text style={[styles.label, { opacity: rightOpacity, color: rightColor }]}>不合格 ⚡</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color="#888" />
      ) : (
        <Animated.View style={{ transform: [{ translateX: Animated.multiply(offset, 0.25) }] }}>
          <Text style={styles.hint}>‹ ⚡ ›</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  labelRow: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: { fontWeight: '700' },
  hint: { color: '#e65100', fontSize: 16 },
});
