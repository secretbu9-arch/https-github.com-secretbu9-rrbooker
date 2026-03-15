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
    const [statusFilter, setStatusFilter] = useState('active'); 
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);

    const [selectedUser, setSelectedUser] = useState(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showArchiveModal, setShowArchiveModal] = useState(false);
    const [showUnarchiveModal, setShowUnarchiveModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
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
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Premium Styles
    const styles = {
        container: {
            padding: windowWidth < 576 ? '1.5rem 1rem' : '2rem 1.5rem',
            backgroundColor: '#fcfcfc',
            minHeight: '100vh',
            fontFamily: "'Outfit', 'Inter', sans-serif"
        },
        headerCard: {
            background: '#fff',
            padding: '1.25rem',
            borderRadius: '24px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
            border: '1px solid #f0f0f0',
            marginBottom: '1.5rem',
            display: 'flex',
            flexDirection: windowWidth < 650 ? 'column' : 'row',
            justifyContent: 'space-between',
            alignItems: windowWidth < 650 ? 'stretch' : 'center',
            gap: '1rem'
        },
        userCard: {
            backgroundColor: '#fff',
            padding: '1.25rem',
            borderRadius: '24px',
            border: '1px solid #eee',
            marginBottom: '1rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            position: 'relative',
            overflow: 'hidden'
        },
        badge: (role) => {
            const colors = {
                manager: { bg: '#FFEBEE', text: '#B71C1C' },
                barber: { bg: '#E3F2FD', text: '#0D47A1' },
                customer: { bg: '#E8F5E9', text: '#1B5E20' },
                archived: { bg: '#f5f5f5', text: '#666' }
            };
            const color = colors[role] || { bg: '#f5f5f5', text: '#666' };
            return {
                padding: '0.4rem 0.8rem',
                borderRadius: '10px',
                fontSize: '0.7rem',
                fontWeight: '700',
                backgroundColor: color.bg,
                color: color.text,
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
            };
        },
        primaryBtn: {
            backgroundColor: '#1a1a1a',
            color: '#fff',
            border: 'none',
            padding: '0.8rem 1.25rem',
            borderRadius: '16px',
            fontWeight: '600',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.6rem',
            transition: 'all 0.3s'
        },
        secondaryBtn: {
            backgroundColor: '#f5f5f5',
            color: '#1a1a1a',
            border: 'none',
            padding: '0.6rem 1rem',
            borderRadius: '12px',
            fontWeight: '600',
            fontSize: '0.8rem',
            transition: 'all 0.2s'
        },
        tab: (active) => ({
            padding: '0.6rem 1.25rem',
            borderRadius: '14px',
            fontSize: '0.85rem',
            fontWeight: '700',
            cursor: 'pointer',
            transition: 'all 0.2s',
            backgroundColor: active ? '#1a1a1a' : 'transparent',
            color: active ? '#fff' : '#888',
            border: active ? 'none' : '1px solid transparent'
        }),
        modalOverlay: {
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(8px)',
            zIndex: 1060,
            display: 'flex',
            alignItems: windowWidth < 576 ? 'flex-end' : 'center',
            justifyContent: 'center',
        },
        modalContent: {
            width: '100%',
            maxWidth: windowWidth < 576 ? '100%' : '500px',
            backgroundColor: '#fff',
            borderRadius: windowWidth < 576 ? '32px 32px 0 0' : '28px',
            boxShadow: '0 -10px 40px rgba(0,0,0,0.1)',
            maxHeight: windowWidth < 576 ? '92vh' : '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: windowWidth < 576 ? 'slideUp 0.4s cubic-bezier(0, 0, 0.2, 1)' : 'scaleIn 0.3s ease-out'
        }
    };

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

    const handleArchiveClick = (user) => {
        setSelectedUser(user);
        setShowArchiveModal(true);
    };

    const handleUnarchiveClick = (user) => {
        setSelectedUser(user);
        setShowUnarchiveModal(true);
    };

    const handleDeleteClick = (user) => {
        setSelectedUser(user);
        setShowDeleteModal(true);
    };

    const handlePhoneFormatting = (value) => {
        let digits = value.replace(/\D/g, '');
        if (value.startsWith('+63')) {
            digits = value.substring(3).replace(/\D/g, '');
        } else if (digits.startsWith('63')) {
            digits = digits.substring(2);
        }
        if (digits.startsWith('0')) {
            digits = digits.substring(1);
        }
        if (digits.length > 0 && digits[0] !== '9') {
            return '';
        }
        if (digits.length > 10) {
            digits = digits.substring(0, 10);
        }
        return digits.length > 0 ? `+63${digits}` : '';
    };

    const handleFormChange = (e) => {
        const { name, value } = e.target;
        if (name === 'phone') {
            setFormData(prev => ({ ...prev, [name]: handlePhoneFormatting(value) }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleAddFormChange = (e) => {
        const { name, value } = e.target;
        if (name === 'phone') {
            setAddFormData(prev => ({ ...prev, [name]: handlePhoneFormatting(value) }));
        } else {
            setAddFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        try {
            setSaving(true);
            setError(null);
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: addFormData.email,
                password: addFormData.password,
                options: {
                    data: {
                        full_name: addFormData.full_name,
                        role: addFormData.role,
                        phone: addFormData.phone
                    },
                    emailRedirectTo: `${window.location.origin}/dashboard`
                }
            });
            if (authError) throw authError;
            if (authData.user) {
                const { error: dbError } = await supabase
                    .from('users')
                    .upsert([{
                        id: authData.user.id,
                        email: addFormData.email,
                        full_name: addFormData.full_name,
                        phone: addFormData.phone,
                        role: addFormData.role
                    }]);
                if (dbError) throw dbError;
                setSuccessMessage(`User created successfully! Auth email sent to ${addFormData.email}.`);
                setShowSuccessModal(true);
                setShowAddModal(false);
                setAddFormData({
                    full_name: '', email: '', password: '', phone: '', role: 'customer'
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
            setUsers(prev => prev.map(u =>
                u.id === selectedUser.id ? { ...u, ...formData, updated_at: new Date().toISOString() } : u
            ));
            setShowEditModal(false);
            setSelectedUser(null);
        } catch (error) {
            console.error('Error updating user:', error);
            alert('Failed to update user.');
        } finally {
            setSaving(false);
        }
    };

    const handleArchiveConfirm = async () => {
        if (!selectedUser) return;
        try {
            setSaving(true);
            const { error } = await supabase.from('users').update({ archived: true }).eq('id', selectedUser.id);
            if (error) throw error;
            setUsers(prev => prev.filter(u => u.id !== selectedUser.id));
            setShowArchiveModal(false);
            setSelectedUser(null);
        } catch (error) {
            alert('Failed to archive user.');
        } finally {
            setSaving(false);
        }
    };

    const handleUnarchiveConfirm = async () => {
        if (!selectedUser) return;
        try {
            setSaving(true);
            const { error } = await supabase.from('users').update({ archived: false }).eq('id', selectedUser.id);
            if (error) throw error;
            setUsers(prev => prev.filter(u => u.id !== selectedUser.id));
            setShowUnarchiveModal(false);
            setSelectedUser(null);
        } catch (error) {
            alert('Failed to unarchive user.');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteConfirm = async () => {
        if (!selectedUser) return;
        try {
            setSaving(true);
            setError(null);
            const { error } = await supabase.from('users').delete().eq('id', selectedUser.id);
            if (error) {
                if (error.code === '23503') throw new Error('Cannot delete user with related records. Archive them instead.');
                throw error;
            }
            setUsers(prev => prev.filter(u => u.id !== selectedUser.id));
            setShowDeleteModal(false);
            setSelectedUser(null);
            setSuccessMessage('User deleted successfully.');
            setShowSuccessModal(true);
        } catch (error) {
            setError(error.message);
            setShowDeleteModal(false);
        } finally {
            setSaving(false);
        }
    };

    const filteredUsers = users.filter(user =>
        user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.phone?.includes(searchQuery)
    );

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.headerCard}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '800', margin: 0, letterSpacing: '-0.5px' }}>
                        <i className="bi bi-people me-2" style={{ color: '#5D4037' }}></i>
                        Manage Users
                    </h2>
                    <p className="text-muted small mb-0">Total system accounts: {users.length}</p>
                </div>
                <button style={styles.primaryBtn} className="touch-btn" onClick={() => setShowAddModal(true)}>
                    <i className="bi bi-person-plus"></i> ADD NEW USER
                </button>
            </div>

            {error && (
                <div className="alert alert-danger rounded-4 border-0 shadow-sm d-flex align-items-center mb-4">
                    <i className="bi bi-exclamation-circle-fill me-2"></i>
                    <span className="small fw-bold">{error}</span>
                    <button className="btn-close ms-auto" onClick={() => setError(null)}></button>
                </div>
            )}

            {/* View Filters */}
            <div className="d-flex gap-2 mb-3 overflow-auto pb-2" style={{ whiteSpace: 'nowrap' }}>
                <div style={styles.tab(statusFilter === 'active')} onClick={() => setStatusFilter('active')}>ACTIVE</div>
                <div style={styles.tab(statusFilter === 'archived')} onClick={() => setStatusFilter('archived')}>ARCHIVED</div>
            </div>

            <div style={{ ...styles.headerCard, padding: '1rem', background: '#fff' }}>
                <div className="row g-2 w-100 align-items-center">
                    <div className="col-md-7">
                        <div className="input-group input-group-sm">
                            <span className="input-group-text bg-white border-end-0 rounded-start-4">
                                <i className="bi bi-search text-muted"></i>
                            </span>
                            <input 
                                type="text" 
                                className="form-control border-start-0 rounded-end-4 bg-white" 
                                placeholder="Search by name, email, phone..."
                                value={searchQuery}
                                onChange={handleSearchChange}
                            />
                        </div>
                    </div>
                    <div className="col-md-5">
                        <select 
                            className="form-select form-select-sm rounded-4" 
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value)}
                        >
                            <option value="all">All Roles</option>
                            <option value="customer">Customers</option>
                            <option value="barber">Barbers</option>
                            <option value="manager">Managers</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Users Table */}
            <div className="users-table-container mt-2">
                {loading ? (
                    <div className="text-center py-5"><div className="spinner-border text-dark"></div></div>
                ) : filteredUsers.length === 0 ? (
                    <div className="text-center py-5 bg-white rounded-5 border">
                        <i className="bi bi-people fs-1 text-muted opacity-25"></i>
                        <p className="text-muted mt-3 fw-bold">No users found</p>
                    </div>
                ) : (
                    <div className="card border-0 shadow-sm" style={{ borderRadius: '24px', overflow: 'hidden' }}>
                        <div className="table-responsive">
                            <table className="table table-hover align-middle mb-0" style={{ backgroundColor: '#fff' }}>
                                <thead style={{ backgroundColor: '#fcfcfc', borderBottom: '1px solid #eee' }}>
                                    <tr>
                                        <th style={{ padding: '1.25rem', fontSize: '0.75rem', fontWeight: '800', color: '#888', letterSpacing: '1px' }}>USER</th>
                                        <th style={{ padding: '1.25rem', fontSize: '0.75rem', fontWeight: '800', color: '#888', letterSpacing: '1px' }}>CONTACT INFO</th>
                                        <th style={{ padding: '1.25rem', fontSize: '0.75rem', fontWeight: '800', color: '#888', letterSpacing: '1px' }}>ROLE</th>
                                        <th style={{ padding: '1.25rem', fontSize: '0.75rem', fontWeight: '800', color: '#888', letterSpacing: '1px' }}>JOINED</th>
                                        <th style={{ padding: '1.25rem', fontSize: '0.75rem', fontWeight: '800', color: '#888', letterSpacing: '1px', textAlign: 'right' }}>ACTIONS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUsers.map(user => (
                                        <tr key={user.id} style={{ transition: 'all 0.2s' }}>
                                            <td style={{ padding: '1.25rem' }}>
                                                <div className="d-flex align-items-center gap-3">
                                                    <div style={{ width: '44px', height: '44px', borderRadius: '14px', backgroundColor: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                        {user.profile_picture_url ? (
                                                            <img src={user.profile_picture_url} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '14px' }} />
                                                        ) : (
                                                            <i className="bi bi-person text-muted fs-5"></i>
                                                        )}
                                                    </div>
                                                    <div className="overflow-hidden">
                                                        <div className="fw-800" style={{ fontSize: '0.95rem', color: '#1a1a1a' }}>{user.full_name || 'No Name'}</div>
                                                        <div className="small text-muted text-truncate" style={{ fontSize: '0.75rem' }}>ID: {user.id.substring(0, 8)}...</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ padding: '1.25rem' }}>
                                                <div className="d-flex flex-column gap-1">
                                                    <div className="small text-dark" style={{ fontSize: '0.8rem', fontWeight: '500' }}>
                                                        <i className="bi bi-envelope me-2 text-muted"></i>{user.email}
                                                    </div>
                                                    <div className="small text-muted" style={{ fontSize: '0.8rem' }}>
                                                        <i className="bi bi-telephone me-2 text-muted"></i>{user.phone || '--'}
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ padding: '1.25rem' }}>
                                                <span style={styles.badge(user.role)}>{user.role}</span>
                                            </td>
                                            <td style={{ padding: '1.25rem' }}>
                                                <div className="small text-dark" style={{ fontSize: '0.85rem' }}>{formatDate(user.created_at)}</div>
                                            </td>
                                            <td style={{ padding: '1.25rem', textAlign: 'right' }}>
                                                <div className="d-flex gap-2 justify-content-end">
                                                    <button style={{ ...styles.secondaryBtn, padding: '0.5rem' }} className="touch-btn" title="Edit" onClick={() => handleEditClick(user)}>
                                                        <i className="bi bi-pencil"></i>
                                                    </button>
                                                    {statusFilter === 'active' ? (
                                                        <button style={{ ...styles.secondaryBtn, color: '#B71C1C', padding: '0.5rem' }} className="touch-btn" title="Archive" onClick={() => handleArchiveClick(user)}>
                                                            <i className="bi bi-archive"></i>
                                                        </button>
                                                    ) : (
                                                        <button style={{ ...styles.secondaryBtn, color: '#1B5E20', padding: '0.5rem' }} className="touch-btn" title="Restore" onClick={() => handleUnarchiveClick(user)}>
                                                            <i className="bi bi-arrow-counterclockwise"></i>
                                                        </button>
                                                    )}
                                                    <button style={{ ...styles.secondaryBtn, color: '#ff4444', background: '#fff1f1', padding: '0.5rem' }} className="touch-btn" title="Delete" onClick={() => handleDeleteClick(user)}>
                                                        <i className="bi bi-trash"></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Modals Container */}
            {(showEditModal || showAddModal || showArchiveModal || showUnarchiveModal || showDeleteModal || showSuccessModal) && (
                <div style={styles.modalOverlay} onClick={(e) => {
                    if (e.target === e.currentTarget) {
                        setShowEditModal(false); setShowAddModal(false); 
                        setShowArchiveModal(false); setShowUnarchiveModal(false); setShowDeleteModal(false);
                    }
                }}>
                    <div style={styles.modalContent}>
                        {/* Drag Indicator */}
                        {windowWidth < 576 && (
                            <div style={{ padding: '12px', display: 'flex', justifyContent: 'center' }}>
                                <div style={{ width: '40px', height: '4px', backgroundColor: '#e0e0e0', borderRadius: '2px' }}></div>
                            </div>
                        )}

                        {/* Modal Header */}
                        <div className="p-4 border-bottom d-flex justify-content-between align-items-center">
                            <h5 className="m-0 fw-800">
                                {showAddModal && 'Add New User'}
                                {showEditModal && 'Edit User Profile'}
                                {showArchiveModal && 'Archive User'}
                                {showUnarchiveModal && 'Restore User'}
                                {showDeleteModal && 'Delete Permanently'}
                                {showSuccessModal && 'Action Successful'}
                            </h5>
                            <button className="btn-close" onClick={() => {
                                setShowEditModal(false); setShowAddModal(false); 
                                setShowArchiveModal(false); setShowUnarchiveModal(false); setShowDeleteModal(false);
                                setShowSuccessModal(false);
                            }}></button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-4 overflow-auto premium-scroll">
                            {showAddModal && (
                                <form onSubmit={handleCreateUser} className="d-flex flex-column gap-3">
                                    <div><label className="small fw-bold mb-1">Full Name</label><input type="text" className="form-control rounded-3" name="full_name" value={addFormData.full_name} onChange={handleAddFormChange} required /></div>
                                    <div><label className="small fw-bold mb-1">Email</label><input type="email" className="form-control rounded-3" name="email" value={addFormData.email} onChange={handleAddFormChange} required /></div>
                                    <div><label className="small fw-bold mb-1">Password</label><input type="password" className="form-control rounded-3" name="password" value={addFormData.password} onChange={handleAddFormChange} required minLength={8} /></div>
                                    <div><label className="small fw-bold mb-1">Phone</label><input type="text" className="form-control rounded-3" name="phone" value={addFormData.phone} onChange={handleAddFormChange} /></div>
                                    <div><label className="small fw-bold mb-1">Role</label><select className="form-select rounded-3" name="role" value={addFormData.role} onChange={handleAddFormChange} required><option value="customer">Customer</option><option value="barber">Barber</option><option value="manager">Manager</option></select></div>
                                    <button style={{ ...styles.primaryBtn, marginTop: '1rem' }} type="submit" disabled={saving}>{saving ? 'Creating...' : 'CREATE USER'}</button>
                                </form>
                            )}
                            {showEditModal && (
                                <form onSubmit={handleSaveEdit} className="d-flex flex-column gap-3">
                                    <div><label className="small fw-bold mb-1">Full Name</label><input type="text" className="form-control rounded-3" name="full_name" value={formData.full_name} onChange={handleFormChange} required /></div>
                                    <div><label className="small fw-bold mb-1">Phone</label><input type="text" className="form-control rounded-3" name="phone" value={formData.phone} onChange={handleFormChange} /></div>
                                    <div><label className="small fw-bold mb-1">Role</label><select className="form-select rounded-3" name="role" value={formData.role} onChange={handleFormChange} required><option value="customer">Customer</option><option value="barber">Barber</option><option value="manager">Manager</option></select></div>
                                    <button style={{ ...styles.primaryBtn, marginTop: '1rem' }} type="submit" disabled={saving}>{saving ? 'Saving...' : 'SAVE CHANGES'}</button>
                                </form>
                            )}
                            {(showArchiveModal || showUnarchiveModal || showDeleteModal) && (
                                <div className="text-center">
                                    <div className="mb-3">
                                        <i className={`bi bi-${showDeleteModal ? 'exclamation-octagon text-danger' : 'info-circle text-warning'} fs-1`}></i>
                                    </div>
                                    <p className="fw-bold mb-1">{selectedUser?.full_name}</p>
                                    <p className="text-muted small">
                                        {showArchiveModal && 'Archive this user? They can be restored later.'}
                                        {showUnarchiveModal && 'Restore this user to active accounts?'}
                                        {showDeleteModal && 'Permanently remove this user? This cannot be undone.'}
                                    </p>
                                    <div className="d-flex gap-2 mt-4">
                                        <button className="btn btn-light flex-fill rounded-3 py-2 fw-bold" onClick={() => {setShowArchiveModal(false); setShowUnarchiveModal(false); setShowDeleteModal(false);}}>CANCEL</button>
                                        <button 
                                            className={`btn btn-${showDeleteModal ? 'danger' : (showArchiveModal ? 'warning' : 'success')} flex-fill rounded-3 py-2 fw-bold`}
                                            onClick={showDeleteModal ? handleDeleteConfirm : (showArchiveModal ? handleArchiveConfirm : handleUnarchiveConfirm)}
                                            disabled={saving}
                                        >
                                            {saving ? 'Processing...' : 'CONFIRM'}
                                        </button>
                                    </div>
                                </div>
                            )}
                            {showSuccessModal && (
                                <div className="text-center py-3">
                                    <i className="bi bi-check-circle text-success" style={{ fontSize: '3rem' }}></i>
                                    <h5 className="mt-3 fw-800">Done!</h5>
                                    <p className="text-muted small">{successMessage}</p>
                                    <button style={styles.primaryBtn} className="w-100 mt-3" onClick={() => setShowSuccessModal(false)}>CONTINUE</button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .fw-800 { font-weight: 800; }
                .touch-btn:active { transform: scale(0.96); }
                .table-hover tbody tr:hover {
                    background-color: #fcfcfc !important;
                    transform: scale(1.002);
                }
                .premium-scroll::-webkit-scrollbar { width: 4px; }
                .premium-scroll::-webkit-scrollbar-thumb { background: #eee; border-radius: 10px; }
                @keyframes slideUp {
                    from { transform: translateY(100%); }
                    to { transform: translateY(0); }
                }
                @keyframes scaleIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
    );
};

export default ManageUsers;
