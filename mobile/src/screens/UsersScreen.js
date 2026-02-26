import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  SectionList,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getUsers, approveUser, denyUser, getAuditLog } from '../api';

export default function UsersScreen() {
  const [tab, setTab] = useState('users'); // 'users' | 'audit'
  const [users, setUsers] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(null); // userId being actioned

  const fetchData = useCallback(async () => {
    try {
      if (tab === 'users') {
        const data = await getUsers();
        setUsers(data);
      } else {
        const data = await getAuditLog();
        setAuditLog(data);
      }
    } catch (err) {
      console.warn('Failed to fetch:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchData();
    }, [fetchData]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  async function handleApprove(userId) {
    setActionLoading(userId);
    try {
      await approveUser(userId);
      fetchData();
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeny(userId) {
    Alert.alert('Deny User', 'Are you sure you want to deny this user?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Deny',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(userId);
          try {
            await denyUser(userId);
            fetchData();
          } catch (err) {
            Alert.alert('Error', err.message);
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  }

  const renderUser = ({ item }) => (
    <View style={styles.userCard}>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.name || 'Unknown'}</Text>
        <Text style={styles.userEmail}>{item.email}</Text>
        <View style={styles.badgeRow}>
          <View
            style={[
              styles.badge,
              {
                backgroundColor:
                  item.status === 'approved'
                    ? '#D4EDDA'
                    : item.status === 'denied'
                    ? '#F8D7DA'
                    : '#FFF3CD',
              },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                {
                  color:
                    item.status === 'approved'
                      ? '#155724'
                      : item.status === 'denied'
                      ? '#721C24'
                      : '#856404',
                },
              ]}
            >
              {item.status}
            </Text>
          </View>
          {item.role === 'admin' && (
            <View style={[styles.badge, { backgroundColor: '#E8F4FD' }]}>
              <Text style={[styles.badgeText, { color: '#0C5DA5' }]}>admin</Text>
            </View>
          )}
        </View>
      </View>

      {item.status === 'pending' && (
        <View style={styles.actions}>
          {actionLoading === item.id ? (
            <ActivityIndicator color="#4285F4" />
          ) : (
            <>
              <TouchableOpacity
                style={styles.approveButton}
                onPress={() => handleApprove(item.id)}
              >
                <Text style={styles.approveText}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.denyButton}
                onPress={() => handleDeny(item.id)}
              >
                <Text style={styles.denyText}>Deny</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );

  const renderAuditEntry = ({ item }) => (
    <View style={styles.auditCard}>
      <View style={styles.auditRow}>
        <Text style={styles.auditAction}>{item.action}</Text>
        <View
          style={[
            styles.auditResultBadge,
            {
              backgroundColor:
                item.result === 'ACK' ? '#D4EDDA' : '#F8D7DA',
            },
          ]}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              color: item.result === 'ACK' ? '#155724' : '#721C24',
            }}
          >
            {item.result}
          </Text>
        </View>
      </View>
      <Text style={styles.auditUser}>
        {item.user?.email || item.userEmail || 'Unknown user'}
      </Text>
      <Text style={styles.auditTime}>
        {new Date(item.timestamp).toLocaleString()}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4285F4" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === 'users' && styles.activeTab]}
          onPress={() => {
            setTab('users');
            setLoading(true);
          }}
        >
          <Text
            style={[styles.tabText, tab === 'users' && styles.activeTabText]}
          >
            Users
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'audit' && styles.activeTab]}
          onPress={() => {
            setTab('audit');
            setLoading(true);
          }}
        >
          <Text
            style={[styles.tabText, tab === 'audit' && styles.activeTabText]}
          >
            Audit Log
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {tab === 'users' ? (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderUser}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>No users yet.</Text>
          }
          contentContainerStyle={users.length === 0 && styles.emptyList}
        />
      ) : (
        <FlatList
          data={auditLog}
          keyExtractor={(item) => item.id}
          renderItem={renderAuditEntry}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>No audit entries yet.</Text>
          }
          contentContainerStyle={auditLog.length === 0 && styles.emptyList}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#4285F4',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#888',
  },
  activeTabText: {
    color: '#4285F4',
    fontWeight: '600',
  },
  userCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  userInfo: {
    marginBottom: 4,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  userEmail: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  approveButton: {
    backgroundColor: '#34C759',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  approveText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  denyButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  denyText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  auditCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    padding: 12,
    elevation: 1,
  },
  auditRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  auditAction: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  auditResultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  auditUser: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  auditTime: {
    fontSize: 12,
    color: '#aaa',
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    fontSize: 14,
    padding: 48,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
  },
});
