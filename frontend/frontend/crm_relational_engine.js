/**
 * RISE CRM Relational Object Store & Business Layer
 */
const CRMStore = {
  getCustomers: () => JSON.parse(localStorage.getItem('crm_customers') || '[]'),
  getPlants: () => JSON.parse(localStorage.getItem('crm_plants') || '[]'),
  getContacts: () => JSON.parse(localStorage.getItem('crm_contacts') || '[]'),
  getEquipment: () => JSON.parse(localStorage.getItem('crm_equipment') || '[]'),
  getEnquiries: () => JSON.parse(localStorage.getItem('crm_enquiries') || '[]'),
  getQuotations: () => JSON.parse(localStorage.getItem('crm_quotations') || '[]'),
  getNegotiations: () => JSON.parse(localStorage.getItem('crm_negotiations') || '[]'),
  getTickets: () => JSON.parse(localStorage.getItem('crm_tickets') || '[]'),
  getActivities: () => JSON.parse(localStorage.getItem('crm_activities') || '[]'),
  getFollowUps: () => JSON.parse(localStorage.getItem('crm_followups') || '[]'),

  seedInitialData: function() {
    if (!localStorage.getItem('crm_seeded')) {
      const demoCust = [{
        id: 'CUST-000101',
        name: 'Vedanta Limited',
        code: 'VED-01',
        gstin: '21AAACV1234F1Z5',
        industry: 'Thermal Power',
        grade: 'A',
        owner: 'Sales Team',
        phone: '+91 6645 222 000',
        email: 'purchase@vedanta.co.in',
        address: 'Jharsuguda Industrial Estate',
        state: 'Odisha'
      }];
      const demoPlants = [{
        id: 'PLNT-00001',
        customerId: 'CUST-000101',
        plantName: 'Jharsuguda CPP 4x600MW',
        code: 'JSR-CPP',
        state: 'Odisha',
        capacity: '2400 MW'
      }];
      const demoContacts = [{
        id: 'CONT-00001',
        customerId: 'CUST-000101',
        plantId: 'PLNT-00001',
        name: 'Rajesh Sharma',
        designation: 'DGM (Mechanical & Spares)',
        department: 'Maintenance',
        mobile: '+91 9876543210',
        email: 'r.sharma@vedanta.co.in',
        contactType: 'Maintenance'
      }];
      const demoEquip = [{
        id: 'EQP-00001',
        customerId: 'CUST-000101',
        plantId: 'PLNT-00001',
        equipmentType: 'PA Fan',
        manufacturer: 'BHEL / Rise OEM Compatible',
        model: 'PAF-240-HD',
        serialNumber: 'SN-PAF-9921',
        warrantyEnd: '2027-03-31'
      }];
      const demoEnq = [{
        id: 'ENQ-26-27-0041',
        customerId: 'CUST-000101',
        plantId: 'PLNT-00001',
        contactId: 'CONT-00001',
        subject: 'Replacement PA Fan Impeller Blades & Wear Plates',
        requirement: 'Heavy duty ceramic lined impeller blades for 600MW unit',
        estimatedValue: 1850000,
        probability: 70,
        status: 'QUOTATION',
        assignedTo: 'Sales Eng.',
        createdDate: '2026-08-15'
      }];
      const demoQuot = [{
        id: 'QT-26-27-0118',
        enquiryId: 'ENQ-26-27-0041',
        customerId: 'CUST-000101',
        plantId: 'PLNT-00001',
        contactId: 'CONT-00001',
        revision: 0,
        totalValue: 1780000,
        status: 'SENT',
        createdDate: '2026-08-20',
        items: [{ desc: 'PA Fan Impeller Blade Set (Grade-A Alloy)', qty: 2, unitPrice: 890000 }]
      }];

      localStorage.setItem('crm_customers', JSON.stringify(demoCust));
      localStorage.setItem('crm_plants', JSON.stringify(demoPlants));
      localStorage.setItem('crm_contacts', JSON.stringify(demoContacts));
      localStorage.setItem('crm_equipment', JSON.stringify(demoEquip));
      localStorage.setItem('crm_enquiries', JSON.stringify(demoEnq));
      localStorage.setItem('crm_quotations', JSON.stringify(demoQuot));
      localStorage.setItem('crm_negotiations', JSON.stringify([]));
      localStorage.setItem('crm_tickets', JSON.stringify([]));
      localStorage.setItem('crm_activities', JSON.stringify([
        { id: 'ACT-01', customerId: 'CUST-000101', type: 'Call', outcome: 'Discussed urgent blade delivery schedule', date: '2026-08-28' }
      ]));
      localStorage.setItem('crm_followups', JSON.stringify([
        { id: 'FLW-01', customerId: 'CUST-000101', subject: 'Commercial negotiation closure', dueDate: '2026-09-02', status: 'PENDING', priority: 'HIGH' }
      ]));
      localStorage.setItem('crm_seeded', 'true');
    }
  },

  // Customer Health Score Engine (Max 100)
  calculateCustomerScore: function(customerId) {
    const enqs = this.getEnquiries().filter(e => e.customerId === customerId);
    const quots = this.getQuotations().filter(q => q.customerId === customerId);
    const tickets = this.getTickets().filter(t => t.customerId === customerId && t.status !== 'CLOSED');
    
    let businessValueScore = Math.min(25, quots.reduce((acc, q) => acc + (q.totalValue || 0), 0) / 100000);
    let enquiryScore = Math.min(20, enqs.length * 5);
    let ticketPenalty = Math.min(15, tickets.length * 5);
    let total = Math.round(businessValueScore + enquiryScore + 40 - ticketPenalty);
    return Math.max(10, Math.min(100, total));
  },

  // Two-Way Link: Convert Enquiry to Quotation
  createQuotationFromEnquiry: function(enquiryId) {
    const enq = this.getEnquiries().find(e => e.id === enquiryId);
    if (!enq) throw new Error("Originating enquiry not found");

    const newQtId = `QT-26-27-${String(Math.floor(1000 + Math.random() * 9000))}`;
    const newQuot = {
      id: newQtId,
      enquiryId: enq.id,
      customerId: enq.customerId,
      plantId: enq.plantId,
      contactId: enq.contactId,
      revision: 0,
      totalValue: enq.estimatedValue || 0,
      status: 'DRAFT',
      createdDate: new Date().toISOString().split('T')[0],
      items: [{ desc: enq.requirement || enq.subject, qty: 1, unitPrice: enq.estimatedValue || 0 }]
    };

    const quots = this.getQuotations();
    quots.push(newQuot);
    localStorage.setItem('crm_quotations', JSON.stringify(quots));

    // Update enquiry status
    enq.status = 'QUOTATION';
    const allEnq = this.getEnquiries().map(e => e.id === enquiryId ? enq : e);
    localStorage.setItem('crm_enquiries', JSON.stringify(allEnq));

    // Log Activity
    this.logActivity({
      customerId: enq.customerId,
      type: 'Status Change',
      outcome: `Generated Quotation ${newQtId} from Enquiry ${enq.id}`
    });

    return newQuot;
  },

  logActivity: function({ customerId, type, outcome }) {
    const acts = this.getActivities();
    acts.unshift({
      id: `ACT-${Date.now()}`,
      customerId,
      type,
      outcome,
      date: new Date().toISOString().split('T')[0]
    });
    localStorage.setItem('crm_activities', JSON.stringify(acts));
  }
};
CRMStore.seedInitialData();