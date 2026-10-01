import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider, useI18n } from '../src/i18n';

function LanguageProbe() {
  const { language, t, toggleLanguage } = useI18n();
  return <button type="button" onClick={toggleLanguage}>{language} · {t('nav.create')}</button>;
}

describe('shared application i18n', () => {
  beforeEach(() => {
    localStorage.removeItem('genalloy.language');
  });
  afterEach(() => {
    localStorage.removeItem('genalloy.language');
  });

  it('toggles the active language and persists the preference', async () => {
    const user = userEvent.setup();
    render(<I18nProvider><LanguageProbe /></I18nProvider>);

    const toggle = screen.getByRole('button');
    expect(toggle).toHaveTextContent('zh-CN · 创作工作台');

    await user.click(toggle);

    expect(toggle).toHaveTextContent('en-US · Creation Workbench');
    expect(localStorage.getItem('genalloy.language')).toBe('en-US');
    expect(document.documentElement.lang).toBe('en-US');
  });

  it('accepts language changes emitted by the settings surface', async () => {
    render(<I18nProvider><LanguageProbe /></I18nProvider>);

    act(() => {
      window.dispatchEvent(new CustomEvent('genalloy:language-change', { detail: 'en-US' }));
    });

    expect(await screen.findByText('en-US · Creation Workbench')).toBeInTheDocument();
  });
});
