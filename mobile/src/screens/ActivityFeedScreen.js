import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import useGateStateSocket from '../hooks/useGateStateSocket';

// ── Constants ────────────────────────────────────────────────────────

const DATE_STRIP_DAYS = 7;

// ── Helpers ──────────────────────────────────────────────────────────

/** Format YYYY-MM-DD from a Date (local timezone) */
function toDateString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Check if two date strings represent the same day */
function isSameDay(a, b) {
  return a === b;
}

/** Format time only (e.g. "2:45 PM") */
function formatTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Short day label (e.g. "Mon", "Tue") */
function getDayLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

/** Day number (e.g. "5", "12") */
function getDayNumber(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.getDate();
}

/** Month + Year label (e.g. "March 2026") from year/month integers */
function getMonthYearLabel(year, month) {
  const d = new Date(year, month, 15);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** Return 7 date-strings ending at `endDateStr` (oldest → newest) */
function getStripDates(endDateStr) {
  const end = new Date(endDateStr + 'T12:00:00');
  const dates = [];
  for (let i = DATE_STRIP_DAYS - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    dates.push(toDateString(d));
  }
  return dates;
}

// ── Date Chip ────────────────────────────────────────────────────────

function DateChip({ dateStr, isSelected, isToday, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, isSelected && styles.chipSelected]}
      activeOpacity={0.7}
    >
      <Text style={[styles.chipDay, isSelected && styles.chipTextSelected]}>
        {isToday ? 'Today' : getDayLabel(dateStr)}
      </Text>
      <Text style={[styles.chipNumber, isSelected && styles.chipTextSelected]}>
        {getDayNumber(dateStr)}
      </Text>
    </TouchableOpacity>
  );
}

// ── Event Row ────────────────────────────────────────────────────────

function EventRow({ item }) {
  const isOpen = item.event === 'OPENED';
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: isOpen ? '#FF3B30' : '#34C759' }]} />
      <View style={styles.rowContent}>
        <Text style={styles.eventTitle}>
          Gate {isOpen ? 'Opened' : 'Closed'}
        </Text>
        <Text style={styles.eventSub}>
          {item.triggeredBy ? `by ${item.triggeredBy}` : 'via remote / button'}
          {item.deviceName ? ` · ${item.deviceName}` : ''}
        </Text>
      </View>
      <Text style={styles.timestamp}>{formatTime(item.timestamp)}</Text>
    </View>
  );
}

// ── Activity Feed Screen ─────────────────────────────────────────────

export default function ActivityFeedScreen({ navigation }) {
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => toDateString(today), [today]);

  // Month-level navigation
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isMounted = useRef(true);

  const isCurrentMonth =
    viewYear === today.getFullYear() && viewMonth === today.getMonth();

  // ── Derived values ───────────────────────────────────

  /** Anchor = rightmost chip. Today if current month, last day of month otherwise */
  const stripEndDate = useMemo(() => {
    if (isCurrentMonth) return todayStr;
    const last = new Date(viewYear, viewMonth + 1, 0); // last day of viewed month
    return toDateString(last);
  }, [viewYear, viewMonth, isCurrentMonth, todayStr]);

  const stripDates = useMemo(() => getStripDates(stripEndDate), [stripEndDate]);
  const monthLabel = useMemo(
    () => getMonthYearLabel(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  // ── Month navigation ────────────────────────────────

  const goToPrevMonth = useCallback(() => {
    let m = viewMonth - 1;
    let y = viewYear;
    if (m < 0) { m = 11; y--; }
    setViewYear(y);
    setViewMonth(m);
    // Select last day of that month
    const lastDay = new Date(y, m + 1, 0);
    setSelectedDate(toDateString(lastDay));
  }, [viewMonth, viewYear]);

  const goToNextMonth = useCallback(() => {
    if (isCurrentMonth) return;
    let m = viewMonth + 1;
    let y = viewYear;
    if (m > 11) { m = 0; y++; }
    setViewYear(y);
    setViewMonth(m);
    // Current month → today, else last day of that month
    if (y === today.getFullYear() && m === today.getMonth()) {
      setSelectedDate(todayStr);
    } else {
      const lastDay = new Date(y, m + 1, 0);
      setSelectedDate(toDateString(lastDay));
    }
  }, [viewMonth, viewYear, isCurrentMonth, today, todayStr]);

  // ── Fetch events for the selected date ───────────────
  const fetchEvents = useCallback(async (date) => {
    try {
      // Convert local day boundaries → UTC ISO strings so the server
      // filters correctly regardless of the user's timezone.
      const localStart = new Date(date + 'T00:00:00');
      const localEnd = new Date(date + 'T23:59:59.999');
      const data = await getGateEvents({
        dateStart: localStart.toISOString(),
        dateEnd: localEnd.toISOString(),
        limit: 200,
      });
      if (isMounted.current) setEvents(data);
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
    setLoading(true);
    fetchEvents(selectedDate);
    return () => { isMounted.current = false; };
  }, [selectedDate, fetchEvents]);

  // ── Auto-poll every 30 s (only for today) ────────────
  useEffect(() => {
    if (selectedDate !== todayStr) return;
    const interval = setInterval(() => {
      if (isMounted.current) fetchEvents(selectedDate);
    }, 30_000);
    return () => clearInterval(interval);
  }, [selectedDate, todayStr, fetchEvents]);

  // ── Pull to refresh ──────────────────────────────────
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchEvents(selectedDate);
  }, [selectedDate, fetchEvents]);

  // ── Real-time updates via WebSocket (today only) ─────
  const onGateEvent = useCallback((event) => {
    if (event.type === 'GATE_EVENT') {
      const eventDate = toDateString(new Date(event.timestamp));
      setSelectedDate((current) => {
        if (isSameDay(current, eventDate)) {
          setEvents((prev) => [event, ...prev]);
        }
        return current;
      });
    }
  }, []);

  useGateStateSocket(null, null, onGateEvent);

  // ── Date selection ───────────────────────────────────
  const onSelectDate = useCallback((dateStr) => {
    setSelectedDate(dateStr);
  }, []);

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

  // ── Render helpers ───────────────────────────────────
  const renderDateChip = useCallback(
    ({ item: dateStr }) => (
      <DateChip
        dateStr={dateStr}
        isSelected={isSameDay(dateStr, selectedDate)}
        isToday={isSameDay(dateStr, todayStr)}
        onPress={() => onSelectDate(dateStr)}
      />
    ),
    [selectedDate, todayStr, onSelectDate],
  );

  const openCount = events.filter((e) => e.event === 'OPENED').length;
  const closeCount = events.filter((e) => e.event === 'CLOSED').length;

  return (
    <View style={styles.container}>
      {/* ── Month header with arrows ─────────────── */}
      <View style={styles.monthRow}>
        <TouchableOpacity onPress={goToPrevMonth} style={styles.monthArrow}>
          <Text style={styles.monthArrowText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <TouchableOpacity
          onPress={goToNextMonth}
          style={styles.monthArrow}
          disabled={isCurrentMonth}
        >
          <Text
            style={[
              styles.monthArrowText,
              isCurrentMonth && styles.monthArrowDisabled,
            ]}
          >
            ›
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Date strip (7 days) ─────────────────── */}
      <FlatList
        data={stripDates}
        horizontal
        keyExtractor={(item) => item}
        renderItem={renderDateChip}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dateStrip}
        style={styles.dateStripContainer}
      />

      {/* ── Day summary ─────────────────────────── */}
      {!loading && events.length > 0 && (
        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            {events.length} event{events.length !== 1 ? 's' : ''}
            {openCount > 0 ? `  ·  ${openCount} opened` : ''}
            {closeCount > 0 ? `  ·  ${closeCount} closed` : ''}
          </Text>
        </View>
      )}

      {/* ── Events list ─────────────────────────── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4285F4" />
        </View>
      ) : (
        <FlatList
          data={events}
          extraData={events}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <EventRow item={item} />}
          contentContainerStyle={events.length === 0 ? styles.center : styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4285F4']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.empty}>No activity on this day</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  // ── Month navigation ──
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    paddingBottom: 4,
    backgroundColor: '#fff',
  },
  monthArrow: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  monthArrowText: {
    fontSize: 26,
    fontWeight: '600',
    color: '#4285F4',
  },
  monthArrowDisabled: {
    color: '#CCC',
  },
  monthLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#333',
    minWidth: 160,
    textAlign: 'center',
  },
  // ── Date strip ──
  dateStripContainer: {
    flexGrow: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DDD',
    backgroundColor: '#fff',
  },
  dateStrip: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: 'center',
    flexGrow: 1,
  },
  chip: {
    width: 46,
    height: 60,
    marginHorizontal: 3,
    borderRadius: 14,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: '#4285F4',
  },
  chipDay: {
    fontSize: 11,
    fontWeight: '500',
    color: '#888',
    marginBottom: 2,
  },
  chipNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  chipTextSelected: {
    color: '#fff',
  },
  // ── Summary ──
  summary: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#F5F5F5',
  },
  summaryText: {
    fontSize: 13,
    color: '#888',
    fontWeight: '500',
  },
  // ── Events list ──
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingVertical: 4,
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
    fontSize: 13,
    color: '#AAA',
    marginLeft: 8,
  },
  // ── Empty state ──
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  empty: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
});
