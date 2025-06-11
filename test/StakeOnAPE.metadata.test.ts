import { expect } from "chai";
import { ethers } from "hardhat";
import { StakeOnAPE, MockERC20, MockERC721 } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe.skip("StakeOnAPE - Token Metadata Tests (DISABLED - Functions Removed for Size Optimization)", function () {
  let stakeOnAPE: StakeOnAPE;
  let nftPass: MockERC721;
  let mockNFT: MockERC721;
  let mockToken: MockERC20;
  let owner: HardhatEthersSigner;
  let poolCreator: HardhatEthersSigner;
  let user: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, poolCreator, user] = await ethers.getSigners();

    // Deploy NFT Pass contract
    const MockERC721Factory = await ethers.getContractFactory("MockERC721");
    nftPass = await MockERC721Factory.deploy("StakeOnAPE Pass", "PASS");
    await nftPass.waitForDeployment();

    // Deploy StakeOnAPE contract
    const StakeOnAPEFactory = await ethers.getContractFactory("StakeOnAPE");
    stakeOnAPE = await StakeOnAPEFactory.deploy(await nftPass.getAddress());
    await stakeOnAPE.waitForDeployment();

    // Deploy mock NFT collection for testing
    mockNFT = await MockERC721Factory.deploy("Test NFT Collection", "TESTNFT");
    await mockNFT.waitForDeployment();

    // Deploy mock ERC20 token for rewards
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20Factory.deploy("Test Reward Token", "TRT", 18);
    await mockToken.waitForDeployment();

    // Mint NFT passes for pool creator (need 10 for pool creation)
    for (let i = 1; i <= 10; i++) {
      await nftPass.mint(poolCreator.address, i);
    }

    // Mint NFT pass for user (need 1 for staking)
    await nftPass.mint(user.address, 11);

    // Mint some reward tokens to pool creator
    await mockToken.mint(poolCreator.address, ethers.parseEther("1000"));
  });

  describe("Token Metadata Storage", function () {
    it("Should store NFT contract metadata when creating a pool", async function () {
      const dailyRewardRate = ethers.parseEther("1"); // 1 token per day
      const lockDuration = 0; // No lock

      // Create a pool
      await stakeOnAPE.connect(poolCreator).createPool(
        await mockNFT.getAddress(),
        await mockToken.getAddress(),
        dailyRewardRate,
        lockDuration
      );

      // Check if NFT metadata was stored
      const nftName = await stakeOnAPE.getNFTContractName(await mockNFT.getAddress());
      const nftSymbol = await stakeOnAPE.getNFTContractSymbol(await mockNFT.getAddress());

      expect(nftName).to.equal("Test NFT Collection");
      expect(nftSymbol).to.equal("TESTNFT");
    });

    it("Should store ERC20 token metadata when creating a pool", async function () {
      const dailyRewardRate = ethers.parseEther("1");
      const lockDuration = 0;

      // Create a pool
      await stakeOnAPE.connect(poolCreator).createPool(
        await mockNFT.getAddress(),
        await mockToken.getAddress(),
        dailyRewardRate,
        lockDuration
      );

      // Check if ERC20 metadata was stored
      const tokenName = await stakeOnAPE.getERC20TokenName(await mockToken.getAddress());

      expect(tokenName).to.equal("Test Reward Token");
    });

    it("Should emit TokenMetadataStored events when storing metadata", async function () {
      const dailyRewardRate = ethers.parseEther("1");
      const lockDuration = 0;

      // Create a pool and check for events
      const tx = await stakeOnAPE.connect(poolCreator).createPool(
        await mockNFT.getAddress(),
        await mockToken.getAddress(),
        dailyRewardRate,
        lockDuration
      );

      // Check for NFT metadata event
      await expect(tx)
        .to.emit(stakeOnAPE, "TokenMetadataStored")
        .withArgs(await mockNFT.getAddress(), "Test NFT Collection", "TESTNFT", true);

      // Check for ERC20 metadata event
      await expect(tx)
        .to.emit(stakeOnAPE, "TokenMetadataStored")
        .withArgs(await mockToken.getAddress(), "Test Reward Token", "TRT", false);
    });

    it("Should not store metadata again for already stored contracts", async function () {
      const dailyRewardRate = ethers.parseEther("1");
      const lockDuration = 0;

      // Create first pool
      await stakeOnAPE.connect(poolCreator).createPool(
        await mockNFT.getAddress(),
        await mockToken.getAddress(),
        dailyRewardRate,
        lockDuration
      );

      // Deploy another NFT with same contracts
      const mockNFT2 = await (await ethers.getContractFactory("MockERC721")).deploy("Another NFT", "ANOTHER");
      await mockNFT2.waitForDeployment();

      // Create second pool with same reward token but different NFT
      const tx = await stakeOnAPE.connect(poolCreator).createPool(
        await mockNFT2.getAddress(),
        await mockToken.getAddress(), // Same reward token
        dailyRewardRate,
        lockDuration
      );

      // Should emit event for new NFT but not for existing reward token
      await expect(tx)
        .to.emit(stakeOnAPE, "TokenMetadataStored")
        .withArgs(await mockNFT2.getAddress(), "Another NFT", "ANOTHER", true);

      // Should NOT emit event for reward token since it's already stored
      const events = await stakeOnAPE.queryFilter(stakeOnAPE.filters.TokenMetadataStored());
      const mockTokenAddress = await mockToken.getAddress();
      const rewardTokenEvents = events.filter(event =>
        event.args[0] === mockTokenAddress &&
        event.transactionHash === tx.hash
      );
      expect(rewardTokenEvents.length).to.equal(0);
    });
  });

  describe("Metadata Getter Functions", function () {
    beforeEach(async function () {
      // Create a pool to store metadata
      const dailyRewardRate = ethers.parseEther("1");
      const lockDuration = 0;

      await stakeOnAPE.connect(poolCreator).createPool(
        await mockNFT.getAddress(),
        await mockToken.getAddress(),
        dailyRewardRate,
        lockDuration
      );
    });

    it("Should return correct NFT contract name", async function () {
      const name = await stakeOnAPE.getNFTContractName(await mockNFT.getAddress());
      expect(name).to.equal("Test NFT Collection");
    });

    it("Should return correct NFT contract symbol", async function () {
      const symbol = await stakeOnAPE.getNFTContractSymbol(await mockNFT.getAddress());
      expect(symbol).to.equal("TESTNFT");
    });

    it("Should return correct ERC20 token name", async function () {
      const name = await stakeOnAPE.getERC20TokenName(await mockToken.getAddress());
      expect(name).to.equal("Test Reward Token");
    });

    it("Should return both NFT name and symbol together", async function () {
      const [name, symbol] = await stakeOnAPE.getNFTContractInfo(await mockNFT.getAddress());
      expect(name).to.equal("Test NFT Collection");
      expect(symbol).to.equal("TESTNFT");
    });

    it("Should return complete pool token metadata", async function () {
      const [nftName, nftSymbol, tokenName] = await stakeOnAPE.getPoolTokenMetadata(1);
      expect(nftName).to.equal("Test NFT Collection");
      expect(nftSymbol).to.equal("TESTNFT");
      expect(tokenName).to.equal("Test Reward Token");
    });

    it("Should return empty strings for contracts without stored metadata", async function () {
      // Deploy a new NFT that hasn't been used in any pool
      const newNFT = await (await ethers.getContractFactory("MockERC721")).deploy("New NFT", "NEW");
      await newNFT.waitForDeployment();

      const name = await stakeOnAPE.getNFTContractName(await newNFT.getAddress());
      const symbol = await stakeOnAPE.getNFTContractSymbol(await newNFT.getAddress());

      expect(name).to.equal("");
      expect(symbol).to.equal("");
    });
  });

  describe("Metadata Storage with createPoolWithValidation", function () {
    it("Should also store metadata when using createPoolWithValidation", async function () {
      const dailyRewardRate = ethers.parseEther("1");
      const lockDuration = 0;

      // Create pool using the validation function
      await stakeOnAPE.connect(poolCreator).createPoolWithValidation(
        await mockNFT.getAddress(),
        await mockToken.getAddress(),
        dailyRewardRate,
        lockDuration,
        "TRT", // Expected symbol
        18     // Expected decimals
      );

      // Check if metadata was stored
      const nftName = await stakeOnAPE.getNFTContractName(await mockNFT.getAddress());
      const nftSymbol = await stakeOnAPE.getNFTContractSymbol(await mockNFT.getAddress());
      const tokenName = await stakeOnAPE.getERC20TokenName(await mockToken.getAddress());

      expect(nftName).to.equal("Test NFT Collection");
      expect(nftSymbol).to.equal("TESTNFT");
      expect(tokenName).to.equal("Test Reward Token");
    });
  });

  describe("Edge Cases", function () {
    it("Should handle contracts that don't implement metadata interface gracefully", async function () {
      // Deploy a basic ERC20 without metadata (this might fail in practice, but we test the try/catch)
      const BasicERC20Factory = await ethers.getContractFactory("MockERC20");
      const basicToken = await BasicERC20Factory.deploy("", "", 0); // Empty metadata
      await basicToken.waitForDeployment();

      const dailyRewardRate = ethers.parseEther("1");
      const lockDuration = 0;

      // This should still work and store placeholder values
      await expect(
        stakeOnAPE.connect(poolCreator).createPool(
          await mockNFT.getAddress(),
          await basicToken.getAddress(),
          dailyRewardRate,
          lockDuration
        )
      ).to.not.be.reverted;

      // Check that some metadata was stored (empty string for name since MockERC20 will return empty)
      const tokenName = await stakeOnAPE.getERC20TokenName(await basicToken.getAddress());
      expect(tokenName).to.equal(""); // MockERC20 returns empty string, not "Unknown Token"
    });

    it("Should revert when trying to get metadata for non-existent pool", async function () {
      await expect(stakeOnAPE.getPoolTokenMetadata(999)).to.be.revertedWith("Pool does not exist");
    });
  });
});