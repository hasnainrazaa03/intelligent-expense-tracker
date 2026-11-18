import React from 'react';
import { Modal } from './ui';
import HouseholdsManager from './HouseholdsManager';

/** Settings → Households (U5): sharing expenses with people you live with.
 *  It sat inside the planning panel; it's an account-level setting. */
const HouseholdsPage: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <Modal asPage isOpen onClose={onBack} title="Households" subtitle="Share expenses with people you live with, and see who owes what.">
    <HouseholdsManager />
  </Modal>
);

export default HouseholdsPage;
