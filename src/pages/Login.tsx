import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export function Login() {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    // Check if current IP is already blocked
    axios.get('/api/admin/check-ip')
      .then(res => {
        if (res.data.blocked) {
          setIsBlocked(true);
          setBlockedMessage(res.data.message);
        }
      })
      .catch(err => {
        console.error("Error checking IP block status", err);
      });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setWarning('');

    try {
      const response = await axios.post('/api/admin/login', { key });
      if (response.data.success) {
        localStorage.setItem('adminKey', 'ARUSHNGGA9');
        navigate('/');
      }
    } catch (err: any) {
      if (err.response) {
        const { data, status } = err.response;
        if (status === 403 && data.blocked) {
          setIsBlocked(true);
          setBlockedMessage(data.message);
        } else if (data.warning) {
          setWarning(data.warning);
        } else {
          setError(data.message || 'Invalid admin key');
        }
      } else {
        setError('Connection error or server offline');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full p-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
        <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-6">
          Admin Login
        </h2>
        
        {isBlocked ? (
          <div className="text-center py-6">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 text-red-600 mb-4 animate-pulse">
              <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">Access Blocked</h3>
            <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed mb-6">
              {blockedMessage || 'Your IP has been blocked due to too many incorrect password attempts.'}
            </p>
            <div className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-900 py-2 rounded-lg">
              Duration requirement: 24-hour temporary timeout.
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded text-sm text-center font-medium animate-shake">
                {error}
              </div>
            )}

            {warning && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-400 text-amber-805 rounded text-sm text-center font-medium text-amber-800">
                ⚠️ {warning}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="adminKey" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Secret Key
                </label>
                <input
                  id="adminKey"
                  type="password"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none transition-all"
                  placeholder="Enter admin key..."
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                Access Panel
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
