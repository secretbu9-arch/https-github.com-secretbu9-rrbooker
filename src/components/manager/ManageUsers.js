// components/manager/ManageUsers.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { formatDate } from '../utils/helpers';
import LoadingSpinner from '../common/LoadingSpinner';

const ManageUsers = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('active'); // 'active' or 'archived'

    const [selectedUser, setSelectedUser] = useState(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showArchiveModal, setShowArchiveModal] = useState(false);
    const [showUnarchiveModal, setShowUnarchiveModal] = useState(false);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState({
        full_name: '',
        role: '',
        phone: ''
    });

    const [addFormData, setAddFormData] = useState({
        full_name: '',
        email: '',
        password: '',
        phone: '',
        role: 'customer'
    });

    useEffect(() => {
        fetchUsers();
    }, [roleFilter, statusFilter]);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            setError(null);

            let query = supabase
                .from('users')
                .select('*');

            if (roleFilter !== 'all') {
                query = query.eq('role', roleFilter);
            }

            if (statusFilter === 'active') {
                query = query.or('archived.is.null,archived.eq.false');
            } else if (statusFilter === 'archived') {
                query = query.eq('archived', true);
            }

            const { data, error } = await query.order('created_at', { ascending: false });

            if (error) throw error;
            setUsers(data || []);
        } catch (error) {
            console.error('Error fetching users:', error);
            setError('Failed to load users. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleSearchChange = (e) => {
        setSearchQuery(e.target.value);
    };

    const handleEditClick = (user) => {
        setSelectedUser(user);
        setFormData({
            full_name: user.full_name || '',
            role: user.role || 'customer',
            phone: user.phone || ''
        });
        setShowEditModal(true);
    };

    const handleFormChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleAddFormChange = (e) => {
        const { name, value } = e.target;
        setAddFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        try {
            setSaving(true);
            setError(null);

            // 1. Create the user in Supabase Auth
            // This will trigger a confirmation email "authenticating the gmail" as requested
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: addFormData.email,
                password: addFormData.password,
                options: {
                    data: {
                        full_name: addFormData.full_name,
                        role: addFormData.role,
                        phone: addFormData.phone
                    },
                    // Redirect back to profile or dashboard after verification
                    emailRedirectTo: `${window.location.origin}/dashboard`
                }
            });

            if (authError) throw authError;

            if (authData.user) {
                // 2. Manually insert into users table if not already handled by trigger
                // Some setups use triggers, but we'll be safe here
                const { error: dbError } = await supabase
                    .from('users')
                    .upsert([{
                        id: authData.user.id,
                        email: addFormData.email,
                        full_name: addFormData.full_name,
                        phone: addFormData.phone,
                        role: addFormData.role
                    }]);

                if (dbError) {
                    console.warn('Profile creation error (might already exist):', dbError);
                }

                alert(`User created successfully! An authentication email has been sent to ${addFormData.email}.`);
                setShowAddModal(false);
                setAddFormData({
                    full_name: '',
                    email: '',
                    password: '',
                    phone: '',
                    role: 'customer'
                });
                fetchUsers();
            }
        } catch (error) {
            console.error('Error creating user:', error);
            setError('Failed to create user: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleSaveEdit = async (e) => {
        e.preventDefault();
        if (!selectedUser) return;

        try {
            setSaving(true);
            const { error } = await supabase
                .from('users')
                .update({
                    full_name: formData.full_name,
                    role: formData.role,
                    phone: formData.phone,
                    updated_at: new Date().toISOString()
                })
                .eq('id', selectedUser.id);

            if (error) throw error;

            // Update local state
            setUsers(prev => prev.map(u =>
                u.id === selectedUser.id
                    ? { ...u, ...formData, updated_at: new Date().toISOString() }
                    : u
            ));

            setShowEditModal(false);
            setSelectedUser(null);
        } catch (error) {
            console.error('Error updating user:', error);
            alert('Failed to update user. ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleArchiveClick = (user) => {
        setSelectedUser(user);
        setShowArchiveModal(true);
    };

    const handleUnarchiveClick = (user) => {
        setSelectedUser(user);
        setShowUnarchiveModal(true);
    };

    const handleArchiveConfirm = async () => {
        if (!selectedUser) return;

        try {
            setSaving(true);
            const { error } = await supabase
                .from('users')
                .update({ archived: true })
                .eq('id', selectedUser.id);

            if (error) throw error;

            setUsers(prev => prev.filter(u => u.id !== selectedUser.id));
            setShowArchiveModal(false);
            setSelectedUser(null);
        } catch (error) {
            console.error('Error archiving user:', error);
            alert('Failed to archive user.');
        } finally {
            setSaving(false);
        }
    };

    const handleUnarchiveConfirm = async () => {
        if (!selectedUser) return;

        try {
            setSaving(true);
            const { error } = await supabase
                .from('users')
                .update({ archived: false })
                .eq('id', selectedUser.id);

            if (error) throw error;

            setUsers(prev => prev.filter(u => u.id !== selectedUser.id));
            setShowUnarchiveModal(false);
            setSelectedUser(null);
        } catch (error) {
            console.error('Error unarchiving user:', error);
            alert('Failed to unarchive user.');
        } finally {
            setSaving(false);
        }
    };

    const filteredUsers = users.filter(user =>
        user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.phone?.includes(searchQuery)
    );

    const getRoleBadgeColor = (role) => {
        switch (role) {
            case 'manager': return 'bg-danger';
            case 'barber': return 'bg-primary';
            case 'customer': return 'bg-success';
            default: return 'bg-secondary';
        }
    };

    return (
        <div className="container-fluid py-4">
            <div className="d-flex justify-content-between align-items-center mb-4 p-3 rounded shadow-sm bg-white">
                <div>
                    <h2 className="mb-0 fw-bold">Manage Users</h2>
                    <p className="text-muted mb-0">Total users: {users.length}</p>
                </div>
                <div>
                    <button
                        className="btn btn-primary d-flex align-items-center gap-2"
                        onClick={() => setShowAddModal(true)}
                    >
                        <i className="bi bi-person-plus-fill"></i>
                        <span>Add New User</span>
                    </button>
                </div>
            </div>

            <div className="card shadow-sm border-0 mb-4">
                <div className="card-body">
                    <div className="row g-3">
                        <div className="col-md-4">
                            <div className="input-group">
                                <span className="input-group-text bg-transparent border-end-0">
                                    <i className="bi bi-search text-muted"></i>
                                </span>
                                <input
                                    type="text"
                                    className="form-control border-start-0 ps-0"
                                    placeholder="Search by name, email or phone..."
                                    value={searchQuery}
                                    onChange={handleSearchChange}
                                />
                            </div>
                        </div>
                        <div className="col-md-3">
                            <select
                                className="form-select"
                                value={roleFilter}
                                onChange={(e) => setRoleFilter(e.target.value)}
                            >
                                <option value="all">All Roles</option>
                                <option value="customer">Customers</option>
                                <option value="barber">Barbers</option>
                                <option value="manager">Managers</option>
                            </select>
                        </div>
                        <div className="col-md-3">
                            <select
                                className="form-select"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                            >
                                <option value="active">Active Users</option>
                                <option value="archived">Archived Users</option>
                            </select>
                        </div>
                        <div className="col-md-2 text-end">
                            <button className="btn btn-outline-secondary" onClick={fetchUsers}>
                                <i className="bi bi-arrow-clockwise me-1"></i> Refresh
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="card shadow-sm border-0">
                <div className="card-body p-0">
                    <div className="table-responsive">
                        <table className="table table-hover align-middle mb-0">
                            <thead className="table-light">
                                <tr>
                                    <th className="ps-4">User</th>
                                    <th>Contact Info</th>
                                    <th>Role</th>
                                    <th>Joined Date</th>
                                    <th className="text-end pe-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="5" className="text-center py-5">
                                            <LoadingSpinner />
                                        </td>
                                    </tr>
                                ) : filteredUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="text-center py-5">
                                            <div className="text-muted">
                                                <i className="bi bi-people fs-1 d-block mb-3"></i>
                                                No users found
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredUsers.map(user => (
                                        <tr key={user.id}>
                                            <td className="ps-4">
                                                <div className="d-flex align-items-center">
                                                    <div
                                                        className="rounded-circle bg-light d-flex align-items-center justify-content-center me-3"
                                                        style={{ width: '40px', height: '40px' }}
                                                    >
                                                        {user.profile_picture_url ? (
                                                            <img
                                                                src={user.profile_picture_url}
                                                                alt=""
                                                                className="rounded-circle"
                                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                            />
                                                        ) : (
                                                            <i className="bi bi-person text-secondary"></i>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <div className="fw-bold">{user.full_name || 'No Name'}</div>
                                                        <small className="text-muted" style={{ fontSize: '0.75rem' }}>{user.id}</small>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="mb-1">
                                                    <i className="bi bi-envelope text-muted me-2"></i>
                                                    {user.email}
                                                </div>
                                                {user.phone && (
                                                    <div>
                                                        <i className="bi bi-telephone text-muted me-2"></i>
                                                        {user.phone}
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                <span className={`badge ${getRoleBadgeColor(user.role)} text-capitalize`}>
                                                    {user.role}
                                                </span>
                                            </td>
                                            <td>{formatDate(user.created_at)}</td>
                                            <td className="text-end pe-4">
                                                <div className="dropdown">
                                                    <button
                                                        className="btn btn-sm btn-light"
                                                        type="button"
                                                        data-bs-toggle="dropdown"
                                                    >
                                                        <i className="bi bi-three-dots-vertical"></i>
                                                    </button>
                                                    <ul className="dropdown-menu dropdown-menu-end">
                                                        <li>
                                                            <button
                                                                className="dropdown-item"
                                                                onClick={() => handleEditClick(user)}
                                                            >
                                                                <i className="bi bi-pencil me-2"></i> Edit
                                                            </button>
                                                        </li>
                                                        {statusFilter === 'active' ? (
                                                            <li>
                                                                <button
                                                                    className="dropdown-item text-danger"
                                                                    onClick={() => handleArchiveClick(user)}
                                                                >
                                                                    <i className="bi bi-archive me-2"></i> Archive
                                                                </button>
                                                            </li>
                                                        ) : (
                                                            <li>
                                                                <button
                                                                    className="dropdown-item text-success"
                                                                    onClick={() => handleUnarchiveClick(user)}
                                                                >
                                                                    <i className="bi bi-arrow-counterclockwise me-2"></i> Unarchive
                                                                </button>
                                                            </li>
                                                        )}
                                                    </ul>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Edit Modal */}
            {showEditModal && (
                <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content border-0 shadow">
                            <div className="modal-header bg-dark text-white">
                                <h5 className="modal-title">Edit User</h5>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    onClick={() => setShowEditModal(false)}
                                ></button>
                            </div>
                            <form onSubmit={handleSaveEdit}>
                                <div className="modal-body">
                                    <div className="mb-3">
                                        <label className="form-label fw-bold small">Full Name</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            name="full_name"
                                            value={formData.full_name}
                                            onChange={handleFormChange}
                                            required
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold small">Phone</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            name="phone"
                                            value={formData.phone}
                                            onChange={handleFormChange}
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold small">Role</label>
                                        <select
                                            className="form-select"
                                            name="role"
                                            value={formData.role}
                                            onChange={handleFormChange}
                                            required
                                        >
                                            <option value="customer">Customer</option>
                                            <option value="barber">Barber</option>
                                            <option value="manager">Manager</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button
                                        type="button"
                                        className="btn btn-light"
                                        onClick={() => setShowEditModal(false)}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="btn btn-primary px-4"
                                        disabled={saving}
                                    >
                                        {saving ? 'Saving...' : 'Save Changes'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Add User Modal */}
            {showAddModal && (
                <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content border-0 shadow">
                            <div className="modal-header bg-primary text-white">
                                <h5 className="modal-title">Add New User</h5>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    onClick={() => setShowAddModal(false)}
                                ></button>
                            </div>
                            <form onSubmit={handleCreateUser}>
                                <div className="modal-body">
                                    <div className="mb-3">
                                        <label className="form-label fw-bold small">Full Name</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            name="full_name"
                                            value={addFormData.full_name}
                                            onChange={handleAddFormChange}
                                            required
                                            placeholder="John Doe"
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold small">Email Address</label>
                                        <input
                                            type="email"
                                            className="form-control"
                                            name="email"
                                            value={addFormData.email}
                                            onChange={handleAddFormChange}
                                            required
                                            placeholder="john@example.com"
                                        />
                                        <small className="text-muted">A verification email will be sent to this address.</small>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold small">Password</label>
                                        <input
                                            type="password"
                                            className="form-control"
                                            name="password"
                                            value={addFormData.password}
                                            onChange={handleAddFormChange}
                                            required
                                            minLength={8}
                                            placeholder="Minimum 8 characters"
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold small">Phone</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            name="phone"
                                            value={addFormData.phone}
                                            onChange={handleAddFormChange}
                                            placeholder="+639..."
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold small">Role</label>
                                        <select
                                            className="form-select"
                                            name="role"
                                            value={addFormData.role}
                                            onChange={handleAddFormChange}
                                            required
                                        >
                                            <option value="customer">Customer</option>
                                            <option value="barber">Barber</option>
                                            <option value="manager">Manager</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button
                                        type="button"
                                        className="btn btn-light"
                                        onClick={() => setShowAddModal(false)}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="btn btn-primary px-4"
                                        disabled={saving}
                                    >
                                        {saving ? 'Creating...' : 'Create & Send Auth Email'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}


            {/* Archive Modal */}
            {showArchiveModal && (
                <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content border-0 shadow">
                            <div className="modal-header bg-warning">
                                <h5 className="modal-title">Archive User</h5>
                                <button
                                    type="button"
                                    className="btn-close"
                                    onClick={() => setShowArchiveModal(false)}
                                ></button>
                            </div>
                            <div className="modal-body">
                                <p>Are you sure you want to archive <strong>{selectedUser?.full_name || selectedUser?.email}</strong>?</p>
                                <p className="small text-muted mb-0">Archived users will not appear in active lists but their data remains in the system.</p>
                            </div>
                            <div className="modal-footer">
                                <button
                                    type="button"
                                    className="btn btn-light"
                                    onClick={() => setShowArchiveModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-warning"
                                    onClick={handleArchiveConfirm}
                                    disabled={saving}
                                >
                                    {saving ? 'Archiving...' : 'Archive User'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Unarchive Modal */}
            {showUnarchiveModal && (
                <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content border-0 shadow">
                            <div className="modal-header bg-success text-white">
                                <h5 className="modal-title">Unarchive User</h5>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    onClick={() => setShowUnarchiveModal(false)}
                                ></button>
                            </div>
                            <div className="modal-body">
                                <p>Are you sure you want to unarchive <strong>{selectedUser?.full_name || selectedUser?.email}</strong>?</p>
                            </div>
                            <div className="modal-footer">
                                <button
                                    type="button"
                                    className="btn btn-light"
                                    onClick={() => setShowUnarchiveModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-success px-4"
                                    onClick={handleUnarchiveConfirm}
                                    disabled={saving}
                                >
                                    {saving ? 'Unarchiving...' : 'Unarchive User'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ManageUsers;
