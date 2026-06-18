import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FaceLab } from './FaceLab';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FaceLab />
  </StrictMode>,
);
