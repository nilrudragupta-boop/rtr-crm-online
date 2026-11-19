const mongoose = require('mongoose');

const modulePermissionSchema = new mongoose.Schema({
    view: { type: Boolean, default: false },
    add: { type: Boolean, default: false },
    edit: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
    print: { type: Boolean, default: false },
    pdfDownload: { type: Boolean, default: false },
    excelDownload: { type: Boolean, default: false },
    import: { type: Boolean, default: false },
    export: { type: Boolean, default: false }
}, { _id: false });

const userPermissionSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },       // Matches sub-user username / ID in AdminCreds
    username: { type: String, required: true },
    tenantOwner: { type: String, default: 'System', index: true }, // Scoped to licensed Admin owner
    permissions: {
        type: Map,
        of: modulePermissionSchema,
        default: {}
    },
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: String, required: true }
}, { timestamps: true });

userPermissionSchema.index({ tenantOwner: 1, userId: 1 }, { unique: true });

const permissionAuditSchema = new mongoose.Schema({
    auditId: { type: String, required: true, unique: true },
    tenantOwner: { type: String, default: 'System', index: true },
    subUserId: { type: String, required: true, index: true },
    subUserName: { type: String, required: true },
    moduleId: { type: String, required: true },
    moduleName: { type: String, required: true },
    previousPermissions: { type: mongoose.Schema.Types.Mixed, default: null },
    newPermissions: { type: mongoose.Schema.Types.Mixed, default: null },
    actionPerformed: {
        type: String,
        enum: ['CREATE', 'UPDATE', 'REMOVE', 'COPY', 'BULK_SAVE'],
        required: true
    },
    changedBy: { type: String, required: true },
    changedByRole: { type: String, default: 'Admin' },
    ipAddress: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

// Prevent modification or deletion of audit logs at the Mongoose layer
permissionAuditSchema.pre(['updateOne', 'findOneAndUpdate', 'deleteOne', 'findOneAndDelete', 'deleteMany'], function () {
    throw new Error('Security Violation: Permission audit logs are immutable.');
});

const UserPermission = mongoose.model('UserPermission', userPermissionSchema);
const PermissionAudit = mongoose.model('PermissionAudit', permissionAuditSchema);

module.exports = {
    UserPermission,
    PermissionAudit
};