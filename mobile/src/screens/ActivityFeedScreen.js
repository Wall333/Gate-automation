import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { getGateEvents } from '../api';
import { useGateStateSocket } from '../hooks/useGateStateSocket';

// ── Helpers ──────────────────────────────────────────────────────────

function formatTimestamp(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr}h ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ── Event Row ────────────────────────────────────────────────────────

function EventRow({ item }) {
  const isOpen = item.event === 'OPENED';
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: isOpen ? '#34C759' : '#FF3B30' }]} />
      <View style={styles.rowContent}>
        <Text style={styles.eventTitle}>
          Gate {isOpen ? 'Opened' : 'Closed'}
        </Text>
        <Text style={styles.eventSub}>
          {item.triggeredBy ? `by ${item.triggeredBy}` : 'via remote / button'}
          {item.deviceName ? ` · ${item.deviceName}` : ''}
        </Text>
      </View>
      <Text style={styles.timestamp}>{formatTimestamp(item.timestamp)}</Text>
    </View>
  );
}

// ── Activity Feed Screen ─────────────────────────────────────────────

export default function ActivityFeedScreen({ navigation }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const isMounted = useRef(true);

  // ── Fetch initial events ─────────────────────────────
  const fetchEvents = useCallback(async () => {
    try {
      const data = await getGateEvents({ limit: 50 });
      if (isMounted.current) {
        setEvents(data);
        setHasMore(data.length === 50);
      }
    } catch (err) {
      console.error('Failed to fetch events:', err);
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    fetchEvents();
    return () => { isMounted.current = false; };
  }, [fetchEvents]);

  // ── Pull to refresh ──────────────────────────────────
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchEvents();
  }, [fetchEvents]);

  // ── Load more (pagination) ───────────────────────────
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || events.length === 0) return;
    setLoadingMore(true);
    try {
      const lastTimestamp = events[events.length - 1].timestamp;
      const data = await getGateEvents({ limit: 50, before: lastTimestamp });
      if (isMounted.current) {
        setEvents((prev) => [...prev, ...data]);
        setHasMore(data.length === 50);
      }
    } catch (err) {
      console.error('Failed to load more events:', err);
    } finally {
      if (isMounted.current) setLoadingMore(false);
    }
  }, [loadingMore, hasMore, events]);

  // ── Real-time updates via WebSocket ──────────────────
  const onGateEvent = useCallback((event) => {
    if (event.type === 'GATE_EVENT') {
      setEvents((prev) => [event, ...prev]);
    }
  }, []);

  useGateStateSocket(null, null, onGateEvent);

  // ── Header right: notification prefs button ──────────
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('NotificationPrefs')}
          style={{ marginRight: 16 }}
        >
          <Text style={{ fontSize: 22 }}>🔔</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  // ── Render ───────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4285F4" />
      </View>
    );
  }

  return (
    <FlatList
      data={events}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <EventRow item={item} />}
      contentContainerStyle={events.length === 0 ? styles.center : styles.list}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4285F4']} />
      }
      onEndReached={loadMore}
      onEndReachedThreshold={0.3}
      ListEmptyComponent={
        <Text style={styles.empty}>No gate events yet</Text>
      }
      ListFooterComponent={
        loadingMore ? (
          <ActivityIndicator style={{ padding: 16 }} color="#4285F4" />
        ) : null
      }
    />
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
    backgroundColor: '#fff',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  rowContent: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  eventSub: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  timestamp: {
    fontSize: 12,
    color: '#AAA',
    marginLeft: 8,
  },
  empty: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
});
