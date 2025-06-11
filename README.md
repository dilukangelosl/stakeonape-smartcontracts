# StakeOnAPE - NFT Soft Staking Platform

A decentralized NFT staking platform that allows NFT holders to stake their NFTs without transferring ownership, earn rewards, and participate in custom staking pools.

## 🚀 Features

### Core Functionality
- **Soft Staking**: Stake NFTs without transferring ownership - your NFTs stay in your wallet
- **Custom Pools**: NFT Pass holders can create custom staking pools with configurable rewards
- **Multi-Token Support**: Support for any ERC721 NFT collection and ERC20 reward tokens
- **Special Rewards**: Pool owners can set special reward rates for rare/legendary NFTs
- **Batch Operations**: Efficient batch staking, unstaking, and reward claiming
- **Flexible Lock Periods**: Optional lock durations or instant unstaking

### Security Features
- **Access Control**: NFT Pass-based permission system
- **Reentrancy Protection**: Comprehensive protection against reentrancy attacks
- **Emergency Controls**: Pause/unpause functionality and emergency withdrawal
- **Atomic Operations**: Batch operations are fully atomic - all or nothing
- **Enhanced Validation**: Comprehensive input validation and bounds checking

### Gas Optimization
- **Efficient Array Operations**: O(1) token removal with index mapping
- **Paginated Views**: Gas-efficient querying for large datasets
- **Batch Processing**: Minimize transaction costs with batch operations

## 🛡️ Security

This contract has undergone a comprehensive security audit with all critical and high-severity issues resolved:

- ✅ **Array Manipulation Security**: Enhanced with index tracking and bounds checking
- ✅ **Access Control Consistency**: Uniform NFT pass validation across all functions
- ✅ **Atomic Batch Operations**: Pre-validation prevents partial state changes
- ✅ **Input Validation**: Comprehensive validation with contract interface checks
- ✅ **Gas Efficiency**: Pagination and optimized operations

**Security Assessment**: ✅ **LOW RISK** - Approved for mainnet deployment

For detailed security analysis, see [StakeOnAPE_Audit_Report.md](./StakeOnAPE_Audit_Report.md)

## 📋 Prerequisites

- Node.js v16 or higher
- npm or yarn
- Hardhat

## 🛠️ Installation

```bash
# Clone the repository
git clone https://github.com/dilukangelosl/stakeonape-smartcontracts
cd stakeonape-contracts

# Install dependencies
npm install

# Compile contracts
npx hardhat compile
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with gas reporting
REPORT_GAS=true npx hardhat test

# Run specific test file
npx hardhat test test/StakeOnAPE.ts
```

## 📚 Usage

### For Pool Creators

1. **Acquire NFT Passes**: You need at least 10 NFT passes to create a pool
2. **Create Pool**: Deploy a staking pool for your NFT collection
3. **Fund Pool**: Deposit reward tokens to incentivize stakers
4. **Configure Special Rewards**: Set special rates for rare NFTs

```solidity
// Example: Create a staking pool
stakeOnAPE.createPool(
    nftContract,        // Your NFT collection address
    rewardToken,        // ERC20 reward token address
    dailyRewardRate,    // Rewards per NFT per day
    lockDuration        // Optional lock period (0 = no lock)
);
```

### For Stakers

1. **Acquire NFT Passes**: You need at least 1 NFT pass to stake
2. **Stake NFTs**: Stake your NFTs in available pools (no ownership transfer)
3. **Claim Rewards**: Claim accumulated rewards anytime
4. **Unstake**: Remove your NFTs from pools when ready

```solidity
// Example: Stake an NFT
stakeOnAPE.stakeNFT(poolId, tokenId);

// Example: Claim rewards
stakeOnAPE.claimRewards(poolId, tokenId);

// Example: Unstake NFT
stakeOnAPE.unstakeNFT(poolId, tokenId);
```

### Batch Operations

Save gas by processing multiple NFTs at once:

```solidity
// Batch stake multiple NFTs
stakeOnAPE.batchStakeNFTs(poolId, [tokenId1, tokenId2, tokenId3]);

// Batch claim rewards
stakeOnAPE.batchClaimRewards(poolId, [tokenId1, tokenId2, tokenId3]);

// Batch unstake
stakeOnAPE.batchUnstakeNFTs(poolId, [tokenId1, tokenId2, tokenId3]);
```

## 📊 Pool Management

### Pool Configuration
- **Daily Reward Rate**: Base rewards per NFT per day
- **Lock Duration**: Optional staking lock period (max 365 days)
- **Special Rewards**: Custom rates for specific token IDs
- **Pool Status**: Active/inactive and staking pause controls

### Pool Health Monitoring
```solidity
// Check if pool can pay rewards
stakeOnAPE.canPoolPayRewards(poolId, tokenId);

// Get pool health for user's NFTs
stakeOnAPE.getPoolHealthForUser(user, poolId);

// Monitor pool balance
stakeOnAPE.getPoolBalance(poolId);
```

## 🔧 Advanced Features

### Pagination Support
Handle large datasets efficiently:
```solidity
// Get paginated staked tokens
stakeOnAPE.getUserStakedTokensPaginated(user, poolId, offset, limit);
```

### Pool Deactivation
Pool owners can permanently deactivate compromised pools:
```solidity
stakeOnAPE.deactivatePool(poolId);
```

### Emergency Functions
Platform owner can handle emergency situations:
```solidity
// Emergency pause
stakeOnAPE.emergencyPause();

// Emergency token withdrawal
stakeOnAPE.emergencyWithdraw(poolId, token, amount, recipient);
```

## 🏗️ Architecture

### Key Components

- **PoolConfig**: Stores pool configuration and state
- **SoftStakeInfo**: Tracks individual NFT staking information
- **Access Control**: NFT Pass-based permission system
- **Index Mapping**: Efficient array operations with O(1) removal
- **Batch Validation**: Atomic operations with pre-validation

### Storage Optimization

- Efficient struct packing for gas savings
- Index-based array management
- Paginated view functions for scalability

## 🚀 Deployment

### Local Development
```bash
# Start local Hardhat node
npx hardhat node

# Deploy to local network
npx hardhat ignition deploy ./ignition/modules/StakeOnAPE.ts --network localhost
```

### Testnet Deployment
```bash
# Deploy to testnet (configure network in hardhat.config.ts)
npx hardhat ignition deploy ./ignition/modules/StakeOnAPE.ts --network goerli
```

### Mainnet Deployment
Ensure all security measures are in place before mainnet deployment:
- Multi-signature wallet for contract ownership
- Governance mechanisms for parameter updates
- Monitoring and alerting systems

## 📈 Gas Costs

Optimized for efficiency:
- **Single Stake**: ~150k gas
- **Batch Stake (10 NFTs)**: ~800k gas
- **Claim Rewards**: ~80k gas
- **Batch Claim (10 NFTs)**: ~400k gas

## 🔐 Security Considerations

- Always verify pool legitimacy before staking
- Monitor pool health and owner behavior
- Use batch operations to save gas
- Keep NFT passes secure as they control access

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add comprehensive tests
4. Ensure all tests pass
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Diluk Angelo**
- Twitter: [@cryptoangelodev](https://x.com/cryptoangelodev)
- Building the future of NFT staking

## 🙏 Acknowledgments

- OpenZeppelin for secure smart contract primitives
- Hardhat for the development framework
- The NFT community for inspiration and feedback

## 📞 Support

For questions, issues, or feature requests:
- Open an issue on GitHub
- Follow [@cryptoangelodev](https://x.com/cryptoangelodev) for updates
- Join our community discussions

---

**⚠️ Disclaimer**: This software is provided "as is" without warranty. Always conduct your own security review and testing before using in production.
