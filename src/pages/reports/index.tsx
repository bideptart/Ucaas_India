import PageSidebarLayout from '@/layout/page-sidebar-layout';
import { SuspenseOutlet } from '@/components/custom/route-suspense';
import Sidebar from './sidebar';
import '@/components/mcm/mcm-page.css';
import './reports-shell-theme.css';

const Reports = () => {
  return (
    // `rp-shell` scopes reports-shell-theme.css to just this section — every
    // page under `/reports/*` (Call History, Local Call List, Outbound,
    // Inbound, Voicemail, Call Recording, Agent Reports, Queue, SMS-Log)
    // renders through `<SuspenseOutlet />` below, inside this one wrapper.
    <div className="mcm-page mcm-admin rp-shell">
      <div className="flex h-full w-full min-w-0 flex-col overflow-x-hidden overflow-y-auto md:flex-row md:overflow-hidden xs:gap-1 md:gap-0">
        <PageSidebarLayout isTab={false} title="Reports" content={<Sidebar />} />
        <SuspenseOutlet />
      </div>
    </div>
  );
};

export default Reports;
