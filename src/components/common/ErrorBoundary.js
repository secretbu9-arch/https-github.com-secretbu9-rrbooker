// components/common/ErrorBoundary.js
import React, { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Catch errors in any components below and re-render with error message
    this.setState({
      error: error,
      errorInfo: errorInfo
    });

    // You can also log the error to an error reporting service
    console.error("Error caught by ErrorBoundary:", error, errorInfo);
    
    // If you have an error logging service, you could send the error there
    // logErrorToService(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <div className="container py-5 text-center">
          <div className="card shadow">
            <div className="card-body">
              <h2 className="text-danger mb-3">
                <i className="bi bi-exclamation-triangle me-2"></i>
                Something went wrong
              </h2>
              <p className="mb-4">
                We're sorry, but an error occurred while trying to display this content.
              </p>
              
              {this.props.showDetails && this.state.error && (
                <div className="alert alert-danger text-start mb-4">
                  <details style={{ whiteSpace: 'pre-wrap' }}>
                    <summary>Error Details</summary>
                    <p>{this.state.error.toString()}</p>
                    <p>Component Stack: {this.state.errorInfo?.componentStack}</p>
                  </details>
                </div>
              )}
              
              <div className="d-flex justify-content-center">
                <button 
                  className="btn btn-primary me-2"
                  onClick={() => window.location.reload()}
                >
                  <i className="bi bi-arrow-clockwise me-1"></i>
                  Refresh Page
                </button>
                <button 
                  className="btn btn-outline-secondary"
                  onClick={() => window.history.back()}
                >
                  <i className="bi bi-arrow-left me-1"></i>
                  Go Back
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // If no error, render children normally
    return this.props.children;
  }
}

export default ErrorBoundary;