// Core layout components (eagerly loaded)
export { default as MainLayout } from './MainLayout';
export { default as Sidebar } from './Sidebar';
export { default as Header } from './Header';

// Views are lazy-loaded in App.tsx for better code splitting
// Do not re-export them here to allow proper chunk splitting
