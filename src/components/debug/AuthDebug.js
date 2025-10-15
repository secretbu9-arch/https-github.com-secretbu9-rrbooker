import React from 'react';
import { useAuth } from '../hooks/useAuth';

const AuthDebug = () => {
  const { user, userRole, userProfile, session, loading, error } = useAuth();

  return (
    <div className="container mt-4">
      <div className="card">
        <div className="card-header">
          <h5>Authentication Debug Information</h5>
        </div>
        <div className="card-body">
          <div className="row">
            <div className="col-md-6">
              <h6>Session Info:</h6>
              <pre className="bg-light p-2 rounded">
                {JSON.stringify(session, null, 2)}
              </pre>
            </div>
            <div className="col-md-6">
              <h6>User Info:</h6>
              <pre className="bg-light p-2 rounded">
                {JSON.stringify(user, null, 2)}
              </pre>
            </div>
          </div>
          
          <div className="row mt-3">
            <div className="col-md-6">
              <h6>User Role:</h6>
              <div className="alert alert-info">
                <strong>userRole:</strong> {userRole || 'null/undefined'}
              </div>
            </div>
            <div className="col-md-6">
              <h6>User Profile:</h6>
              <pre className="bg-light p-2 rounded">
                {JSON.stringify(userProfile, null, 2)}
              </pre>
            </div>
          </div>
          
          <div className="row mt-3">
            <div className="col-md-6">
              <h6>Loading State:</h6>
              <div className="alert alert-warning">
                <strong>Loading:</strong> {loading ? 'true' : 'false'}
              </div>
            </div>
            <div className="col-md-6">
              <h6>Error State:</h6>
              <div className="alert alert-danger">
                <strong>Error:</strong> {error || 'none'}
              </div>
            </div>
          </div>
          
          <div className="row mt-3">
            <div className="col-12">
              <h6>Role Check Results:</h6>
              <div className="alert alert-primary">
                <strong>Is Manager:</strong> {userRole === 'manager' ? 'YES' : 'NO'}<br/>
                <strong>User Role Value:</strong> "{userRole}"<br/>
                <strong>User Role Type:</strong> {typeof userRole}<br/>
                <strong>User Role === 'manager':</strong> {userRole === 'manager' ? 'true' : 'false'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthDebug;


