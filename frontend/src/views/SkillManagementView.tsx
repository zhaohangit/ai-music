import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import {
  Wand2,
  Plus,
  Search,
  Trash2,
  Edit3,
  FileText,
  Folder,
  RefreshCw,
  X
} from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { skillsApi, SkillInfo } from '../services/api';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 0 8px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const HeaderSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Title = styled.h1`
  font-size: 1.875rem;
  font-weight: 700;
  color: #1D1D1F;
  margin: 0;
`;

const Subtitle = styled.p`
  font-size: 1rem;
  color: #86868B;
  margin: 0;
`;

const ActionBar = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const SearchBox = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #FFFFFF;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  width: 280px;

  svg {
    color: #86868B;
  }

  input {
    flex: 1;
    border: none;
    outline: none;
    font-size: 0.875rem;
    color: #1D1D1F;
    background: transparent;

    &::placeholder {
      color: #86868B;
    }
  }
`;

const Button = styled.button<{ $primary?: boolean; $danger?: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;

  ${props => props.$primary ? `
    background: linear-gradient(135deg, #FA2D48, #FC3C44);
    color: white;

    &:hover {
      opacity: 0.9;
    }
  ` : props.$danger ? `
    background: rgba(255, 59, 48, 0.1);
    color: #FF3B30;

    &:hover {
      background: rgba(255, 59, 48, 0.15);
    }
  ` : `
    background: #FFFFFF;
    color: #1D1D1F;
    border: 1px solid rgba(0, 0, 0, 0.08);

    &:hover {
      background: #F5F5F7;
    }
  `}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SkillsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
`;

const SkillCard = styled.div`
  background: #FFFFFF;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: all 0.15s ease;

  &:hover {
    border-color: rgba(250, 45, 72, 0.2);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  }
`;

const SkillHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
`;

const SkillInfoContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
`;

const SkillName = styled.h3`
  font-size: 1rem;
  font-weight: 600;
  color: #1D1D1F;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;

  svg {
    color: #FA2D48;
  }
`;

const SkillPath = styled.span`
  font-size: 0.75rem;
  color: #86868B;
  font-family: 'IBM Plex Mono', monospace;
`;

const SkillDescription = styled.p`
  font-size: 0.875rem;
  color: #6E6E73;
  margin: 0;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const SkillActions = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const IconButton = styled.button<{ $danger?: boolean }>`
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: ${props => props.$danger ? '#FF3B30' : '#86868B'};
  transition: all 0.15s ease;

  &:hover {
    background: ${props => props.$danger ? 'rgba(255, 59, 48, 0.1)' : 'rgba(0, 0, 0, 0.05)'};
    color: ${props => props.$danger ? '#FF3B30' : '#1D1D1F'};
  }
`;

const SkillMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 8px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
`;

const MetaItem = styled.span`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  color: #86868B;

  svg {
    width: 14px;
    height: 14px;
  }
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  color: #86868B;
`;

const EmptyIcon = styled.div`
  width: 64px;
  height: 64px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;

  svg {
    color: #86868B;
  }
`;

const EmptyTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: #1D1D1F;
  margin: 0 0 8px 0;
`;

const EmptyText = styled.p`
  font-size: 0.875rem;
  margin: 0;
`;

const LoadingSpinner = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;

  svg {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

// Modal components
const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContainer = styled.div`
  background: #FFFFFF;
  border-radius: 16px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
`;

const ModalTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: #1D1D1F;
  margin: 0;
`;

const CloseButton = styled.button`
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #86868B;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
    color: #1D1D1F;
  }
`;

const ModalBody = styled.div`
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.label`
  font-size: 0.875rem;
  font-weight: 500;
  color: #1D1D1F;
`;

const Input = styled.input`
  padding: 10px 12px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  font-size: 0.875rem;
  color: #1D1D1F;
  outline: none;
  transition: border-color 0.15s ease;

  &:focus {
    border-color: #FA2D48;
  }

  &::placeholder {
    color: #86868B;
  }
`;

const TextArea = styled.textarea`
  padding: 10px 12px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  font-size: 0.875rem;
  color: #1D1D1F;
  outline: none;
  resize: vertical;
  min-height: 200px;
  font-family: 'IBM Plex Mono', monospace;
  transition: border-color 0.15s ease;

  &:focus {
    border-color: #FA2D48;
  }

  &::placeholder {
    color: #86868B;
  }
`;

const ModalFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
`;

const ErrorMessage = styled.span`
  font-size: 0.75rem;
  color: #FF3B30;
`;

const HintText = styled.span`
  font-size: 0.75rem;
  color: #86868B;
`;

interface SkillModalProps {
  isOpen: boolean;
  onClose: () => void;
  skill?: SkillInfo | null;
  onSave: (skill: { name: string; description: string; content: string }) => Promise<void>;
}

const DEFAULT_SKILL_TEMPLATE = `# Skill Instructions

This skill helps with specific tasks. Add your instructions here.

## Usage

Describe how to use this skill.

## Examples

Provide examples of expected behavior.
`;

const SkillModal: React.FC<SkillModalProps> = ({ isOpen, onClose, skill, onSave }) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (skill) {
      setName(skill.name);
      setDescription(skill.description);
      setContent(skill.content);
    } else {
      setName('');
      setDescription('');
      setContent(DEFAULT_SKILL_TEMPLATE);
    }
    setError('');
  }, [skill, isOpen]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError(t('skills.skillNameRequired', 'Skill name is required'));
      return;
    }
    if (!name.match(/^[a-z0-9-]+$/)) {
      setError(t('skills.skillNameHint'));
      return;
    }
    if (!description.trim()) {
      setError(t('skills.descriptionRequired', 'Description is required'));
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSave({ name, description, content });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save skill');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContainer onClick={e => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>{skill ? t('skills.editSkill') : t('skills.createNewSkill')}</ModalTitle>
          <CloseButton onClick={onClose}>
            <X size={18} />
          </CloseButton>
        </ModalHeader>
        <ModalBody>
          <FormGroup>
            <Label>{t('skills.skillName')}</Label>
            <Input
              placeholder="my-skill"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!!skill}
            />
            <HintText>{t('skills.skillNameHint')}</HintText>
          </FormGroup>
          <FormGroup>
            <Label>{t('skills.description')}</Label>
            <Input
              placeholder={t('skills.descriptionHint')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormGroup>
          <FormGroup>
            <Label>{t('skills.content')}</Label>
            <TextArea
              placeholder={t('skills.contentHint')}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </FormGroup>
          {error && <ErrorMessage>{error}</ErrorMessage>}
        </ModalBody>
        <ModalFooter>
          <Button onClick={onClose} disabled={saving}>{t('skills.cancel')}</Button>
          <Button $primary onClick={handleSave} disabled={saving}>
            {saving ? t('skills.saving') : (skill ? t('skills.saveChanges') : t('skills.createSkill', 'Create Skill'))}
          </Button>
        </ModalFooter>
      </ModalContainer>
    </ModalOverlay>
  );
};

export const SkillManagementView: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<SkillInfo | null>(null);

  useEffect(() => {
    loadSkills();
  }, []);

  const loadSkills = async () => {
    setLoading(true);
    try {
      const response = await skillsApi.list();
      if (response.success && response.data) {
        setSkills(response.data);
      } else {
        toast.showError(t('skills.loadFailed'));
      }
    } catch (error: any) {
      console.error('Failed to load skills:', error);
      toast.showError(error.message || t('skills.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSkill = async (data: { name: string; description: string; content: string }) => {
    const response = await skillsApi.create({
      name: data.name,
      description: data.description,
      content: data.content,
    });

    if (response.success && response.data) {
      setSkills([...skills, response.data]);
      toast.showSuccess(t('skills.createSuccess', { name: data.name }));
    } else {
      throw new Error(response.error?.message || t('skills.createFailed'));
    }
  };

  const handleUpdateSkill = async (data: { name: string; description: string; content: string }) => {
    if (!editingSkill) return;

    const response = await skillsApi.update(editingSkill.name, {
      description: data.description,
      content: data.content,
    });

    if (response.success && response.data) {
      setSkills(skills.map(s =>
        s.name === editingSkill.name ? response.data! : s
      ));
      toast.showSuccess(t('skills.updateSuccess', { name: data.name }));
      setEditingSkill(null);
    } else {
      throw new Error(response.error?.message || t('skills.updateFailed'));
    }
  };

  const handleDeleteSkill = async (skill: SkillInfo) => {
    if (!window.confirm(t('skills.confirmDelete', { name: skill.name }))) {
      return;
    }

    try {
      const response = await skillsApi.delete(skill.name);
      if (response.success) {
        setSkills(skills.filter(s => s.name !== skill.name));
        toast.showSuccess(t('skills.deleteSuccess', { name: skill.name }));
      } else {
        toast.showError(response.error?.message || t('skills.deleteFailed'));
      }
    } catch (error: any) {
      toast.showError(error.message || t('skills.deleteFailed'));
    }
  };

  const openEditModal = (skill: SkillInfo) => {
    setEditingSkill(skill);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingSkill(null);
  };

  const filteredSkills = skills.filter(skill =>
    skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    skill.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Container>
      <Header>
        <HeaderSection>
          <Title>{t('skills.title', 'Skill Management')}</Title>
          <Subtitle>{t('skills.subtitle', 'Manage Claude Code Skills for AI assistance')}</Subtitle>
        </HeaderSection>
        <ActionBar>
          <SearchBox>
            <Search size={16} />
            <input
              placeholder={t('skills.search', 'Search skills...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </SearchBox>
          <Button onClick={loadSkills} disabled={loading}>
            <RefreshCw size={16} />
            {t('skills.refresh')}
          </Button>
          <Button $primary onClick={() => setModalOpen(true)}>
            <Plus size={16} />
            {t('skills.newSkill')}
          </Button>
        </ActionBar>
      </Header>

      {loading ? (
        <LoadingSpinner>
          <RefreshCw size={32} />
        </LoadingSpinner>
      ) : filteredSkills.length === 0 ? (
        <EmptyState>
          <EmptyIcon>
            <Wand2 size={28} />
          </EmptyIcon>
          <EmptyTitle>{searchQuery ? t('skills.noResults') : t('skills.noSkills')}</EmptyTitle>
          <EmptyText>
            {searchQuery
              ? t('skills.adjustSearch')
              : t('skills.noSkillsDesc')}
          </EmptyText>
        </EmptyState>
      ) : (
        <SkillsGrid>
          {filteredSkills.map((skill) => (
            <SkillCard key={skill.name}>
              <SkillHeader>
                <SkillInfoContainer>
                  <SkillName>
                    <Wand2 size={16} />
                    {skill.name}
                  </SkillName>
                  <SkillPath>{skill.path}</SkillPath>
                </SkillInfoContainer>
                <SkillActions>
                  <IconButton onClick={() => openEditModal(skill)} title="Edit">
                    <Edit3 size={16} />
                  </IconButton>
                  <IconButton $danger onClick={() => handleDeleteSkill(skill)} title="Delete">
                    <Trash2 size={16} />
                  </IconButton>
                </SkillActions>
              </SkillHeader>
              <SkillDescription>{skill.description}</SkillDescription>
              <SkillMeta>
                <MetaItem>
                  <FileText size={14} />
                  SKILL.md
                </MetaItem>
                <MetaItem>
                  <Folder size={14} />
                  {skill.name}
                </MetaItem>
              </SkillMeta>
            </SkillCard>
          ))}
        </SkillsGrid>
      )}

      <SkillModal
        isOpen={modalOpen}
        onClose={closeModal}
        skill={editingSkill}
        onSave={editingSkill ? handleUpdateSkill : handleCreateSkill}
      />
    </Container>
  );
};

export default SkillManagementView;
