import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../../constants/theme';
import { useLanguage } from '../../context/LanguageContext';
import { PatientCard } from '../../components/PatientCard';
import { patientRepository } from '../../services/db/patientRepo';
import { screeningRepository } from '../../services/db/screeningRepo';
import { Patient } from '@asha/shared';

export default function PatientSearchScreen() {
  const router = useRouter();
  const { language, t } = useLanguage();

  const [searchQuery, setSearchQuery] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([]);
  const [villages, setVillages] = useState<string[]>([]);
  const [selectedVillage, setSelectedVillage] = useState<string>('all');
  const [highRiskPatientIds, setHighRiskPatientIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadPatients();
    }, [])
  );

  const loadPatients = async () => {
    setLoading(true);
    try {
      const [data, scrList] = await Promise.all([
        patientRepository.getAll(),
        screeningRepository.list(),
      ]);

      setPatients(data);
      setFilteredPatients(data);

      // Collect unique villages from patients
      const uniqueV = Array.from(new Set(data.map(p => p.village))).filter(Boolean);
      setVillages(uniqueV);

      // Identify patients with high-risk screenings
      const hrSet = new Set<string>();
      for (const s of scrList) {
        if (s.rule_results && s.rule_results.some(r => r.priority === 'high')) {
          hrSet.add(s.patient_id);
        }
      }
      setHighRiskPatientIds(hrSet);
    } catch (e) {
      console.warn('Error loading patients', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let result = patients;
    if (selectedVillage !== 'all') {
      result = result.filter(p => p.village === selectedVillage);
    }
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.phone && p.phone.includes(q)) ||
        (p.household_id && p.household_id.toLowerCase().includes(q))
      );
    }
    setFilteredPatients(result);
  }, [searchQuery, selectedVillage, patients]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleCol}>
          <Text style={styles.headerTitle} numberOfLines={1}>{t.patientDirectoryTitle}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{patients.length} {t.patientsCountSuffix}</Text>
        </View>
        <TouchableOpacity
          style={styles.addIconBtn}
          onPress={() => router.push('/patients/new')}
          accessibilityLabel={t.addPatientBtn}
        >
          <Ionicons name="person-add" size={18} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Search Input Bar */}
      <View style={styles.searchBarWrapper}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={Colors.outline} />
          <TextInput
            style={styles.searchInput}
            placeholder={t.searchPlaceholder}
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={Colors.outline} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Chips */}
      <View style={styles.chipsRow}>
        <TouchableOpacity
          style={[styles.chip, selectedVillage === 'all' && styles.chipActive]}
          onPress={() => setSelectedVillage('all')}
        >
          <Text style={[styles.chipText, selectedVillage === 'all' && styles.chipTextActive]}>
            {t.allVillages}
          </Text>
        </TouchableOpacity>
        {villages.map(village => (
          <TouchableOpacity
            key={village}
            style={[styles.chip, selectedVillage === village && styles.chipActive]}
            onPress={() => setSelectedVillage(village)}
          >
            <Text style={[styles.chipText, selectedVillage === village && styles.chipTextActive]}>
              {village}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Beneficiary List */}
      <View style={styles.listContainer}>
        {loading ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={filteredPatients}
            keyExtractor={item => item.id}
            initialNumToRender={15}
            maxToRenderPerBatch={20}
            windowSize={10}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <PatientCard
                patient={item}
                riskStatus={highRiskPatientIds.has(item.id) ? 'high' : 'normal'}
                onPress={() => {
                  router.push(`/patients/${item.id}`);
                }}
              />
            )}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Ionicons name="people-outline" size={40} color={Colors.outline} />
                <Text style={styles.emptyTitle}>{t.noPatientsFound}</Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm + 4,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleCol: {
    flex: 1,
    flexShrink: 1,
    marginLeft: 6,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  headerSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  addIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchBarWrapper: {
    paddingHorizontal: Spacing.sm + 4,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: Colors.surface,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  chipsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md2,
    paddingVertical: 6,
    gap: 6,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: Colors.surface,
    fontWeight: '700',
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    padding: Spacing.md2,
    paddingBottom: 24,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 8,
  },
});
