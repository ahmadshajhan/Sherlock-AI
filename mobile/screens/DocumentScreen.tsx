import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  Alert, ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../contexts/ThemeContext';
import { apiService } from '../services/api';

interface Document {
  id: string;
  filename: string;
  file_type: string;
  analysis: string;
  created_at: string;
}

export default function DocumentScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const data = await apiService.getDocuments();
      setDocuments(data.documents || []);
    } catch (e) {
      console.log('Failed to load documents:', e);
    } finally {
      setLoading(false);
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'text/plain', 'text/csv'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const file = result.assets[0];
      setUploading(true);

      const data = await apiService.uploadDocument(
        file.uri, file.name, file.mimeType || 'application/pdf'
      );

      setDocuments(prev => [data, ...prev]);
      setSelectedDoc(data);
      Alert.alert('Success', 'Document analyzed successfully!');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'pdf': return 'document-text';
      case 'txt': case 'text': return 'reader';
      case 'csv': return 'grid';
      default: return 'document';
    }
  };

  if (selectedDoc) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
        {/* Detail Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => setSelectedDoc(null)} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={theme.text} />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
              {selectedDoc.filename}
            </Text>
            <Text style={[styles.headerSub, { color: theme.textSecondary }]}>
              {selectedDoc.file_type.toUpperCase()} • {new Date(selectedDoc.created_at).toLocaleDateString()}
            </Text>
          </View>
        </View>

        {/* Analysis Content */}
        <FlatList
          data={[{ id: '1' }]}
          keyExtractor={item => item.id}
          renderItem={() => (
            <View style={styles.analysisContent}>
              <View style={[styles.analysisCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.analysisBadge}>
                  <Ionicons name="analytics" size={16} color={theme.primary} />
                  <Text style={[styles.analysisBadgeText, { color: theme.primary }]}>AI Analysis</Text>
                </View>
                <Text style={[styles.analysisText, { color: theme.text }]}>
                  {selectedDoc.analysis}
                </Text>
              </View>
            </View>
          )}
          contentContainerStyle={styles.analysisContainer}
          showsVerticalScrollIndicator={false}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.pageTitle, { color: theme.text }]}>Documents</Text>
        <Text style={[styles.pageSubtitle, { color: theme.textSecondary }]}>
          Upload & analyze crime documents
        </Text>
      </View>

      {/* Upload Button */}
      <View style={styles.uploadSection}>
        <TouchableOpacity
          style={[styles.uploadButton, { backgroundColor: theme.primary }]}
          onPress={pickDocument}
          disabled={uploading}
          activeOpacity={0.8}
        >
          {uploading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="cloud-upload" size={24} color="#FFF" />
              <Text style={styles.uploadText}>Upload Document</Text>
              <Text style={styles.uploadHint}>PDF, TXT, CSV supported</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Documents List */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.primary} />
      ) : (
        <FlatList
          data={documents}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.docItem, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={() => setSelectedDoc(item)}
              activeOpacity={0.7}
            >
              <View style={[styles.docIcon, { backgroundColor: theme.primary + '15' }]}>
                <Ionicons name={getFileIcon(item.file_type) as any} size={22} color={theme.primary} />
              </View>
              <View style={styles.docInfo}>
                <Text style={[styles.docName, { color: theme.text }]} numberOfLines={1}>
                  {item.filename}
                </Text>
                <Text style={[styles.docMeta, { color: theme.textTertiary }]}>
                  {item.file_type.toUpperCase()} • {new Date(item.created_at).toLocaleDateString()}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.docList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="folder-open-outline" size={48} color={theme.textTertiary} />
              <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
                No documents yet
              </Text>
              <Text style={[styles.emptyHint, { color: theme.textTertiary }]}>
                Upload FIR reports, crime documents, or text files for AI analysis
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
  },
  backBtn: { marginRight: 12 },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerSub: { fontSize: 12, marginTop: 2 },
  pageTitle: { fontSize: 24, fontWeight: '700' },
  pageSubtitle: { fontSize: 13, marginTop: 4 },
  uploadSection: { paddingHorizontal: 20, paddingVertical: 16 },
  uploadButton: {
    borderRadius: 16,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 6,
  },
  uploadText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  uploadHint: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  docList: { paddingHorizontal: 20, gap: 10 },
  docItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  docIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  docInfo: { flex: 1 },
  docName: { fontSize: 15, fontWeight: '600' },
  docMeta: { fontSize: 12, marginTop: 2 },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 40,
    gap: 8,
  },
  emptyText: { fontSize: 16, fontWeight: '600', marginTop: 8 },
  emptyHint: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  analysisContainer: { padding: 20 },
  analysisContent: {},
  analysisCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  analysisBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  analysisBadgeText: { fontSize: 14, fontWeight: '600' },
  analysisText: { fontSize: 14, lineHeight: 22 },
});
