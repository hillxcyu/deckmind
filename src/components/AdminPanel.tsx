import React, { useEffect, useState } from 'react';
import { auth } from '../services/auth';
import { Trash2, UserPlus, Shield, User, X, Loader2 } from 'lucide-react';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
}

export function AdminPanel({ isOpen, onClose, currentUser }: AdminPanelProps) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', is_admin: false });

  useEffect(() => {
    if (isOpen) loadUsers();
  }, [isOpen]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const list = await auth.listUsers();
      setUsers(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await auth.createUser(newUser);
      setNewUser({ username: '', password: '', is_admin: false });
      loadUsers();
    } catch (e) {
      alert("Failed to create user");
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Delete this user? Their decks will also be deleted.")) {
      try {
        await auth.deleteUser(id);
        loadUsers();
      } catch (e) {
        alert("Failed to delete user");
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            User Management
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 overflow-y-auto">
          {/* Create User Form */}
          <form onSubmit={handleCreate} className="mb-8 bg-gray-50 p-4 rounded-lg border border-gray-200">
            <h3 className="font-semibold mb-3 text-gray-700 flex items-center gap-2">
                <UserPlus className="w-4 h-4" /> Add New User
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input 
                placeholder="Username" 
                required
                className="p-2 border rounded"
                value={newUser.username}
                onChange={e => setNewUser({...newUser, username: e.target.value})}
              />
              <input 
                placeholder="Password" 
                type="password"
                required
                className="p-2 border rounded"
                value={newUser.password}
                onChange={e => setNewUser({...newUser, password: e.target.value})}
              />
              <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                    <input 
                        type="checkbox" 
                        checked={newUser.is_admin}
                        onChange={e => setNewUser({...newUser, is_admin: e.target.checked})}
                        className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    Admin Access
                  </label>
                  <button type="submit" className="ml-auto bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm">Add</button>
              </div>
            </div>
          </form>

          {/* User List */}
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-700 mb-2">Existing Users</h3>
            {loading ? <Loader2 className="animate-spin" /> : users.map(user => (
              <div key={user.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${user.is_admin ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-600'}`}>
                    {user.is_admin ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{user.username}</div>
                    <div className="text-xs text-gray-500">Joined: {new Date(user.created_at).toLocaleDateString()}</div>
                  </div>
                </div>
                
                {user.id !== currentUser.id && (
                  <button 
                    onClick={() => handleDelete(user.id)}
                    className="text-gray-400 hover:text-red-600 p-2 transition-colors"
                    title="Delete User"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
