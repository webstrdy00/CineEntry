import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import { createCollection } from '../services/collectionService';
import { useAlert } from './CustomAlert';

interface CreateCollectionModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const CreateCollectionModal: React.FC<CreateCollectionModalProps> = ({
  visible,
  onClose,
  onCreated,
}) => {
  const { showAlert } = useAlert();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      setName('');
      setDescription('');
    }
  }, [visible]);

  const handleCreate = async () => {
    if (!name.trim() || loading) return;

    setLoading(true);
    try {
      await createCollection({
        name: name.trim(),
        description: description.trim() || undefined,
        is_auto: false,
      });
      onCreated();
      onClose();
    } catch (error: any) {
      showAlert('오류', error?.message || '컬렉션을 만들지 못했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  const isDisabled = !name.trim() || loading;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>새 컬렉션 만들기</Text>
            <TouchableOpacity onPress={onClose} disabled={loading}>
              <Ionicons name="close" size={24} color={COLORS.lightGray} />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>컬렉션 이름 *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="컬렉션 이름을 입력하세요"
            placeholderTextColor={COLORS.lightGray}
            maxLength={50}
            editable={!loading}
          />

          <Text style={styles.label}>설명 (선택)</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="컬렉션 설명을 입력하세요"
            placeholderTextColor={COLORS.lightGray}
            maxLength={200}
            multiline
            numberOfLines={3}
            editable={!loading}
          />

          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.buttonCancel, loading && styles.buttonDisabled]}
              onPress={onClose}
              disabled={loading}
            >
              <Text style={styles.buttonCancelText}>취소</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.buttonCreate, isDisabled && styles.buttonDisabled]}
              onPress={handleCreate}
              disabled={isDisabled}
            >
              {loading ? (
                <ActivityIndicator size="small" color={COLORS.darkNavy} />
              ) : (
                <Text style={styles.buttonCreateText}>만들기</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
  },
  content: {
    backgroundColor: COLORS.deepGray,
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  label: {
    fontSize: 13,
    color: COLORS.lightGray,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.darkNavy,
    color: COLORS.white,
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    marginBottom: 16,
  },
  inputMultiline: {
    height: 90,
    textAlignVertical: 'top',
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  buttonCancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.lightGray,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  buttonCancelText: {
    color: COLORS.lightGray,
    fontWeight: '600',
    fontSize: 15,
  },
  buttonCreate: {
    flex: 1,
    backgroundColor: COLORS.gold,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  buttonCreateText: {
    color: COLORS.darkNavy,
    fontWeight: '600',
    fontSize: 15,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});

export default CreateCollectionModal;
