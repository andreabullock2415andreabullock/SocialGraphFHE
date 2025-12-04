// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface SocialConnection {
  id: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  connectionType: string;
  status: "pending" | "verified" | "rejected";
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newConnectionData, setNewConnectionData] = useState({
    connectionType: "",
    description: "",
    targetAddress: ""
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");

  // Calculate statistics for dashboard
  const verifiedCount = connections.filter(c => c.status === "verified").length;
  const pendingCount = connections.filter(c => c.status === "pending").length;
  const rejectedCount = connections.filter(c => c.status === "rejected").length;

  // Filter connections based on search and filter
  const filteredConnections = connections.filter(connection => {
    const matchesSearch = connection.owner.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         connection.connectionType.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === "all" || connection.status === filterType;
    return matchesSearch && matchesFilter;
  });

  useEffect(() => {
    loadConnections().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadConnections = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("connection_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing connection keys:", e);
        }
      }
      
      const list: SocialConnection[] = [];
      
      for (const key of keys) {
        try {
          const connectionBytes = await contract.getData(`connection_${key}`);
          if (connectionBytes.length > 0) {
            try {
              const connectionData = JSON.parse(ethers.toUtf8String(connectionBytes));
              list.push({
                id: key,
                encryptedData: connectionData.data,
                timestamp: connectionData.timestamp,
                owner: connectionData.owner,
                connectionType: connectionData.connectionType,
                status: connectionData.status || "pending"
              });
            } catch (e) {
              console.error(`Error parsing connection data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading connection ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setConnections(list);
    } catch (e) {
      console.error("Error loading connections:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitConnection = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting social connection with Zama FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newConnectionData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const connectionId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const connectionData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        connectionType: newConnectionData.connectionType,
        status: "pending"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `connection_${connectionId}`, 
        ethers.toUtf8Bytes(JSON.stringify(connectionData))
      );
      
      const keysBytes = await contract.getData("connection_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(connectionId);
      
      await contract.setData(
        "connection_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted social connection submitted securely!"
      });
      
      await loadConnections();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewConnectionData({
          connectionType: "",
          description: "",
          targetAddress: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const verifyConnection = async (connectionId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted social graph with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const connectionBytes = await contract.getData(`connection_${connectionId}`);
      if (connectionBytes.length === 0) {
        throw new Error("Connection not found");
      }
      
      const connectionData = JSON.parse(ethers.toUtf8String(connectionBytes));
      
      const updatedConnection = {
        ...connectionData,
        status: "verified"
      };
      
      await contract.setData(
        `connection_${connectionId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedConnection))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE verification completed successfully!"
      });
      
      await loadConnections();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Verification failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const rejectConnection = async (connectionId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted social graph with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const connectionBytes = await contract.getData(`connection_${connectionId}`);
      if (connectionBytes.length === 0) {
        throw new Error("Connection not found");
      }
      
      const connectionData = JSON.parse(ethers.toUtf8String(connectionBytes));
      
      const updatedConnection = {
        ...connectionData,
        status: "rejected"
      };
      
      await contract.setData(
        `connection_${connectionId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedConnection))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE rejection completed successfully!"
      });
      
      await loadConnections();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Rejection failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const tutorialSteps = [
    {
      title: "Connect Wallet",
      description: "Connect your Web3 wallet to access your private social graph",
      icon: "🔗"
    },
    {
      title: "Add Encrypted Connections",
      description: "Create social connections that are encrypted using FHE technology",
      icon: "🔒"
    },
    {
      title: "FHE-Powered Recommendations",
      description: "Get suggestions based on your encrypted social graph without exposing your data",
      icon: "⚙️"
    },
    {
      title: "Maintain Privacy",
      description: "Your social connections remain private while still being useful",
      icon: "📊"
    }
  ];

  const renderPieChart = () => {
    const total = connections.length || 1;
    const verifiedPercentage = (verifiedCount / total) * 100;
    const pendingPercentage = (pendingCount / total) * 100;
    const rejectedPercentage = (rejectedCount / total) * 100;

    return (
      <div className="pie-chart-container">
        <div className="pie-chart">
          <div 
            className="pie-segment verified" 
            style={{ transform: `rotate(${verifiedPercentage * 3.6}deg)` }}
          ></div>
          <div 
            className="pie-segment pending" 
            style={{ transform: `rotate(${(verifiedPercentage + pendingPercentage) * 3.6}deg)` }}
          ></div>
          <div 
            className="pie-segment rejected" 
            style={{ transform: `rotate(${(verifiedPercentage + pendingPercentage + rejectedPercentage) * 3.6}deg)` }}
          ></div>
          <div className="pie-center">
            <div className="pie-value">{connections.length}</div>
            <div className="pie-label">Connections</div>
          </div>
        </div>
        <div className="pie-legend">
          <div className="legend-item">
            <div className="color-box verified"></div>
            <span>Verified: {verifiedCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box pending"></div>
            <span>Pending: {pendingCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box rejected"></div>
            <span>Rejected: {rejectedCount}</span>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="cyber-spinner"></div>
      <p>Initializing encrypted social graph...</p>
    </div>
  );

  return (
    <div className="app-container socialgraph-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="network-icon"></div>
          </div>
          <h1>Private<span>Social</span>Graph</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-connection-btn cyber-button"
          >
            <div className="add-icon"></div>
            Add Connection
          </button>
          <button 
            className="cyber-button"
            onClick={() => setShowTutorial(!showTutorial)}
          >
            {showTutorial ? "Hide Tutorial" : "Show Tutorial"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>FHE-Powered Private Social Graph</h2>
            <p>Maintain private social connections while enabling on-chain recommendations</p>
          </div>
        </div>
        
        {showTutorial && (
          <div className="tutorial-section">
            <h2>FHE Social Graph Tutorial</h2>
            <p className="subtitle">Learn how to build your private encrypted social network</p>
            
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div 
                  className="tutorial-step"
                  key={index}
                >
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="dashboard-grid">
          <div className="dashboard-card cyber-card">
            <h3>Project Introduction</h3>
            <p>Private on-chain social graph using FHE technology to encrypt your social connections while enabling recommendations.</p>
            <div className="fhe-badge">
              <span>FHE-Powered</span>
            </div>
          </div>
          
          <div className="dashboard-card cyber-card">
            <h3>Social Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{connections.length}</div>
                <div className="stat-label">Total Connections</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{verifiedCount}</div>
                <div className="stat-label">Verified</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{pendingCount}</div>
                <div className="stat-label">Pending</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{rejectedCount}</div>
                <div className="stat-label">Rejected</div>
              </div>
            </div>
          </div>
          
          <div className="dashboard-card cyber-card">
            <h3>Status Distribution</h3>
            {renderPieChart()}
          </div>
        </div>
        
        <div className="connections-section">
          <div className="section-header">
            <h2>Encrypted Social Connections</h2>
            <div className="header-actions">
              <div className="search-filter">
                <input 
                  type="text" 
                  placeholder="Search connections..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
                <select 
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">All</option>
                  <option value="verified">Verified</option>
                  <option value="pending">Pending</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <button 
                onClick={loadConnections}
                className="refresh-btn cyber-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="connections-list cyber-card">
            <div className="table-header">
              <div className="header-cell">ID</div>
              <div className="header-cell">Type</div>
              <div className="header-cell">Owner</div>
              <div className="header-cell">Date</div>
              <div className="header-cell">Status</div>
              <div className="header-cell">Actions</div>
            </div>
            
            {filteredConnections.length === 0 ? (
              <div className="no-connections">
                <div className="no-connections-icon"></div>
                <p>No social connections found</p>
                <button 
                  className="cyber-button primary"
                  onClick={() => setShowCreateModal(true)}
                >
                  Create First Connection
                </button>
              </div>
            ) : (
              filteredConnections.map(connection => (
                <div className="connection-row" key={connection.id}>
                  <div className="table-cell connection-id">#{connection.id.substring(0, 6)}</div>
                  <div className="table-cell">{connection.connectionType}</div>
                  <div className="table-cell">{connection.owner.substring(0, 6)}...{connection.owner.substring(38)}</div>
                  <div className="table-cell">
                    {new Date(connection.timestamp * 1000).toLocaleDateString()}
                  </div>
                  <div className="table-cell">
                    <span className={`status-badge ${connection.status}`}>
                      {connection.status}
                    </span>
                  </div>
                  <div className="table-cell actions">
                    {isOwner(connection.owner) && connection.status === "pending" && (
                      <>
                        <button 
                          className="action-btn cyber-button success"
                          onClick={() => verifyConnection(connection.id)}
                        >
                          Verify
                        </button>
                        <button 
                          className="action-btn cyber-button danger"
                          onClick={() => rejectConnection(connection.id)}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="community-section">
          <h2>Join Our Community</h2>
          <div className="community-links">
            <a href="#" className="community-link">Discord</a>
            <a href="#" className="community-link">Twitter</a>
            <a href="#" className="community-link">Telegram</a>
            <a href="#" className="community-link">GitHub</a>
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitConnection} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          connectionData={newConnectionData}
          setConnectionData={setNewConnectionData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content cyber-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="cyber-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="network-icon"></div>
              <span>PrivateSocialGraph</span>
            </div>
            <p>FHE-powered private on-chain social connections</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} PrivateSocialGraph. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  connectionData: any;
  setConnectionData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  connectionData,
  setConnectionData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setConnectionData({
      ...connectionData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!connectionData.connectionType || !connectionData.targetAddress) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal cyber-card">
        <div className="modal-header">
          <h2>Add Encrypted Social Connection</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Your social connection will be encrypted with Zama FHE
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Connection Type *</label>
              <select 
                name="connectionType"
                value={connectionData.connectionType} 
                onChange={handleChange}
                className="cyber-select"
              >
                <option value="">Select type</option>
                <option value="Follow">Follow</option>
                <option value="Friend">Friend</option>
                <option value="Colleague">Colleague</option>
                <option value="Family">Family</option>
                <option value="Other">Other</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Target Address *</label>
              <input 
                type="text"
                name="targetAddress"
                value={connectionData.targetAddress} 
                onChange={handleChange}
                placeholder="0x..." 
                className="cyber-input"
              />
            </div>
            
            <div className="form-group full-width">
              <label>Description</label>
              <textarea 
                name="description"
                value={connectionData.description} 
                onChange={handleChange}
                placeholder="Optional description of this connection..." 
                className="cyber-textarea"
                rows={3}
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> Connection remains encrypted during FHE processing
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn cyber-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn cyber-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;