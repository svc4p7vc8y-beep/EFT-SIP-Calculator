import React from 'react';
import { createRoot } from 'react-dom/client';
import Site from './Site.jsx';
import './site.css';

// Preserve questionnaire links saved before the public homepage was introduced.
if (new URLSearchParams(location.search).get('clientBrief') === 'pending') {
  location.replace(`./react.html${location.search}${location.hash}`);
} else {
  createRoot(document.getElementById('root')).render(<React.StrictMode><Site /></React.StrictMode>);
}
