import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

// Глобальный error boundary — аналог src/app/ErrorBoundary.jsx web-версии.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (__DEV__) console.warn('App error boundary:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Что-то пошло не так</Text>
        <Text style={styles.message}>{String(this.state.error?.message || this.state.error)}</Text>
        <Pressable style={styles.button} onPress={() => this.setState({ error: null })}>
          <Text style={styles.buttonText}>Попробовать снова</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#0a0a0b',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: '#fafafa',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  message: {
    color: '#8b8b91',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#a3e635',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  buttonText: {
    color: '#0a0a0b',
    fontWeight: '700',
  },
});
