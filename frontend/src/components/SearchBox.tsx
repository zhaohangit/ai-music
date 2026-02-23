import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { Search } from 'lucide-react';

export interface SearchBoxProps {
  placeholder?: string;
  onSearch?: (query: string) => void;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
}

const SearchContainer = styled.div`
  position: relative;
  width: 100%;
  max-width: 500px;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 16px 56px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 24px;
  backdrop-filter: blur(40px);
  -webkit-backdrop-filter: blur(40px);
  color: #FFFFFF;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 16px;
  outline: none;
  transition: all 0.3s ease;

  &::placeholder {
    color: #8B8B9F;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
  }

  &:focus {
    background: rgba(255, 255, 255, 0.12);
    border-color: #667EEA;
    box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
  }
`;

const SearchIcon = styled.div`
  position: absolute;
  left: 20px;
  top: 50%;
  transform: translateY(-50%);
  color: #8B8B9F;
  pointer-events: none;
  transition: color 0.3s ease;

  ${SearchInput}:focus ~ & {
    color: #667EEA;
  }
`;

const ClearButton = styled.button<{ isVisible: boolean }>`
  position: absolute;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: ${props => props.isVisible ? 'flex' : 'none'};
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #FFFFFF;
  font-size: 16px;
  opacity: ${props => props.isVisible ? 1 : 0};
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }
`;

export const SearchBox: React.FC<SearchBoxProps> = ({
  placeholder = 'Search...',
  onSearch,
  value: controlledValue,
  onChange,
  className
}) => {
  const [internalValue, setInternalValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : internalValue;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (!isControlled) {
      setInternalValue(newValue);
    }
    onChange?.(newValue);
  };

  const handleClear = () => {
    if (!isControlled) {
      setInternalValue('');
    }
    onChange?.('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSearch) {
      onSearch(value);
    }
  };

  return (
    <SearchContainer className={className}>
      <SearchIcon>
        <Search size={20} />
      </SearchIcon>
      <SearchInput
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
      <ClearButton
        isVisible={value.length > 0}
        onClick={handleClear}
        aria-label="Clear search"
      >
        ×
      </ClearButton>
    </SearchContainer>
  );
};

export default SearchBox;
