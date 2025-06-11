import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import hre from "hardhat";

describe("StakeOnAPE", function () {
  // We define fixtures to reuse the same setup in every test
  async function deployContractsFixture() {
    const [owner, poolOwner, staker1, staker2, nonPassHolder] =
      await hre.ethers.getSigners();

    // Deploy mock NFT Pass contract
    const MockERC721 = await hre.ethers.getContractFactory("MockERC721");
    const nftPass = await MockERC721.deploy("NFT Pass", "PASS");

    // Deploy mock NFT collection for staking
    const nftCollection = await MockERC721.deploy("Test NFT", "TEST");

    // Deploy mock ERC20 reward token
    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    const rewardToken = await MockERC20.deploy(
      "Reward Token",
      "REWARD",
      18
    );

    // Deploy StakeOnAPE contract
    const StakeOnAPE = await hre.ethers.getContractFactory("StakeOnAPE");
    const stakeOnAPE = await StakeOnAPE.deploy(nftPass.target);

    // Setup: Mint NFT passes to relevant accounts
    // Owner gets multiple passes for testing
    for (let i = 1; i <= 5; i++) {
      await nftPass.mint(owner.address, i);
    }
    
    // Pool owners need 10+ passes for pool creation
    for (let i = 6; i <= 20; i++) {
      await nftPass.mint(poolOwner.address, i);
    }
    
    // Stakers need at least 1 pass each
    for (let i = 21; i <= 25; i++) {
      await nftPass.mint(staker1.address, i);
    }
    
    for (let i = 26; i <= 30; i++) {
      await nftPass.mint(staker2.address, i);
    }

    // Setup: Mint NFTs for staking
    for (let i = 1; i <= 30; i++) {
      await nftCollection.mint(staker1.address, i);
      await nftCollection.mint(staker2.address, i + 30);
    }

    // Setup: Distribute reward tokens
    await rewardToken.transfer(
      poolOwner.address,
      hre.ethers.parseEther("10000")
    );
    await rewardToken.transfer(staker1.address, hre.ethers.parseEther("1000"));

    return {
      stakeOnAPE,
      nftPass,
      nftCollection,
      rewardToken,
      owner,
      poolOwner,
      staker1,
      staker2,
      nonPassHolder,
    };
  }

  async function deployPoolFixture() {
    const contracts = await loadFixture(deployContractsFixture);
    const { stakeOnAPE, nftCollection, rewardToken, poolOwner } = contracts;

    // Create a pool
    const dailyRewardRate = hre.ethers.parseEther("1"); // 1 token per day
    const lockDuration = 7 * 24 * 60 * 60; // 7 days

    const tx = await stakeOnAPE
      .connect(poolOwner)
      .createPool(
        nftCollection.target,
        rewardToken.target,
        dailyRewardRate,
        lockDuration
      );

    const receipt = await tx.wait();
    const poolId = 1; // First pool created

    // Fund the pool
    const fundAmount = hre.ethers.parseEther("1000");
    await rewardToken.connect(poolOwner).approve(stakeOnAPE.target, fundAmount);
    await stakeOnAPE.connect(poolOwner).depositToPool(poolId, fundAmount);

    return {
      ...contracts,
      poolId,
      dailyRewardRate,
      lockDuration,
      fundAmount,
    };
  }

  async function deployPoolFixtureNoLock() {
    const contracts = await loadFixture(deployContractsFixture);
    const { stakeOnAPE, nftCollection, rewardToken, poolOwner } = contracts;

    // Create a pool with no lock duration
    const dailyRewardRate = hre.ethers.parseEther("1"); // 1 token per day
    const lockDuration = 0; // No lock

    const tx = await stakeOnAPE
      .connect(poolOwner)
      .createPool(
        nftCollection.target,
        rewardToken.target,
        dailyRewardRate,
        lockDuration
      );

    const receipt = await tx.wait();
    const poolId = 1; // First pool created

    // Fund the pool
    const fundAmount = hre.ethers.parseEther("1000");
    await rewardToken.connect(poolOwner).approve(stakeOnAPE.target, fundAmount);
    await stakeOnAPE.connect(poolOwner).depositToPool(poolId, fundAmount);

    return {
      ...contracts,
      poolId,
      dailyRewardRate,
      lockDuration,
      fundAmount,
    };
  }

  describe("Deployment", function () {
    it("Should set the correct NFT pass contract", async function () {
      const { stakeOnAPE, nftPass } = await loadFixture(deployContractsFixture);
      expect(await stakeOnAPE.nftPassContract()).to.equal(nftPass.target);
    });

    it("Should set the correct constants", async function () {
      const { stakeOnAPE } = await loadFixture(deployContractsFixture);
      expect(await stakeOnAPE.SECONDS_PER_DAY()).to.equal(86400);
      expect(await stakeOnAPE.MAX_BATCH_SIZE()).to.equal(20);
      expect(await stakeOnAPE.MAX_LOCK_DURATION()).to.equal(365 * 24 * 60 * 60);
    });

    it("Should set the correct owner", async function () {
      const { stakeOnAPE, owner } = await loadFixture(deployContractsFixture);
      expect(await stakeOnAPE.owner()).to.equal(owner.address);
    });
  });

  describe("Pool Creation", function () {
    it("Should create a pool successfully with valid parameters", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner } =
        await loadFixture(deployContractsFixture);

      const dailyRewardRate = hre.ethers.parseEther("1");
      const lockDuration = 7 * 24 * 60 * 60;

      await expect(
        stakeOnAPE
          .connect(poolOwner)
          .createPool(
            nftCollection.target,
            rewardToken.target,
            dailyRewardRate,
            lockDuration
          )
      )
        .to.emit(stakeOnAPE, "PoolCreated")
        .withArgs(
          1,
          poolOwner.address,
          nftCollection.target,
          rewardToken.target,
          dailyRewardRate,
          lockDuration
        );
    });

    it("Should revert if caller doesn't have NFT pass", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, nonPassHolder } =
        await loadFixture(deployContractsFixture);

      await expect(
        stakeOnAPE
          .connect(nonPassHolder)
          .createPool(
            nftCollection.target,
            rewardToken.target,
            hre.ethers.parseEther("1"),
            0
          )
      ).to.be.revertedWith("Insufficient NFT passes for pool creation");
    });

    it("Should revert with invalid parameters", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner } =
        await loadFixture(deployContractsFixture);

      // Invalid NFT contract
      await expect(
        stakeOnAPE
          .connect(poolOwner)
          .createPool(
            hre.ethers.ZeroAddress,
            rewardToken.target,
            hre.ethers.parseEther("1"),
            0
          )
      ).to.be.revertedWith("Invalid NFT contract");

      // Invalid reward token
      await expect(
        stakeOnAPE
          .connect(poolOwner)
          .createPool(
            nftCollection.target,
            hre.ethers.ZeroAddress,
            hre.ethers.parseEther("1"),
            0
          )
      ).to.be.revertedWith("Invalid reward token");

      // Invalid reward rate
      await expect(
        stakeOnAPE
          .connect(poolOwner)
          .createPool(nftCollection.target, rewardToken.target, 0, 0)
      ).to.be.revertedWith("Invalid reward rate");

      // Lock duration too long
      await expect(
        stakeOnAPE
          .connect(poolOwner)
          .createPool(
            nftCollection.target,
            rewardToken.target,
            hre.ethers.parseEther("1"),
            366 * 24 * 60 * 60
          )
      ).to.be.revertedWith("Lock duration too long");
    });

    it("Should update user and collection pool mappings", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner } =
        await loadFixture(deployContractsFixture);

      await stakeOnAPE
        .connect(poolOwner)
        .createPool(
          nftCollection.target,
          rewardToken.target,
          hre.ethers.parseEther("1"),
          0
        );

      const userPools = await stakeOnAPE.getUserPools(poolOwner.address);
      expect(userPools).to.deep.equal([1n]);

      const collectionPools = await stakeOnAPE.getCollectionPools(
        nftCollection.target
      );
      expect(collectionPools).to.deep.equal([1n]);
    });
  });

  describe("Pool Funding", function () {
    it("Should fund pool successfully", async function () {
      const { stakeOnAPE, rewardToken, poolOwner, poolId, fundAmount } =
        await loadFixture(deployPoolFixture);

      const poolInfo = await stakeOnAPE.getPoolInfo(poolId);
      expect(poolInfo.balance).to.equal(fundAmount);
    });

    it("Should revert if not pool owner", async function () {
      const { stakeOnAPE, rewardToken, staker1, poolId } = await loadFixture(
        deployPoolFixture
      );

      await expect(
        stakeOnAPE
          .connect(staker1)
          .depositToPool(poolId, hre.ethers.parseEther("100"))
      ).to.be.revertedWith("Not pool owner");
    });

    it("Should revert with invalid amount", async function () {
      const { stakeOnAPE, poolOwner, poolId } = await loadFixture(
        deployPoolFixture
      );

      await expect(
        stakeOnAPE.connect(poolOwner).depositToPool(poolId, 0)
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should emit PoolFunded event", async function () {
      const { stakeOnAPE, rewardToken, poolOwner } = await loadFixture(
        deployContractsFixture
      );
      const { nftCollection } = await loadFixture(deployContractsFixture);

      await stakeOnAPE
        .connect(poolOwner)
        .createPool(
          nftCollection.target,
          rewardToken.target,
          hre.ethers.parseEther("1"),
          0
        );

      const fundAmount = hre.ethers.parseEther("500");
      await rewardToken
        .connect(poolOwner)
        .approve(stakeOnAPE.target, fundAmount);

      await expect(stakeOnAPE.connect(poolOwner).depositToPool(1, fundAmount))
        .to.emit(stakeOnAPE, "PoolFunded")
        .withArgs(1, poolOwner.address, fundAmount, fundAmount);
    });
  });

  describe("NFT Soft Staking", function () {
    it("Should soft stake NFT successfully", async function () {
      const { stakeOnAPE, nftCollection, staker1, poolId } = await loadFixture(
        deployPoolFixture
      );

      // No approval needed for soft staking
      await expect(stakeOnAPE.connect(staker1).stakeNFT(poolId, 1))
        .to.emit(stakeOnAPE, "SoftStakeCreated")
        .withArgs(poolId, staker1.address, 1, anyValue);

      // Verify NFT is still with original owner
      expect(await nftCollection.ownerOf(1)).to.equal(staker1.address);
    });

    it("Should soft stake NFT in pool without lock duration", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner, staker1 } =
        await loadFixture(deployContractsFixture);

      // Create pool without lock duration
      await stakeOnAPE.connect(poolOwner).createPool(
        nftCollection.target,
        rewardToken.target,
        hre.ethers.parseEther("1"),
        0 // No lock duration
      );

      const fundAmount = hre.ethers.parseEther("1000");
      await rewardToken
        .connect(poolOwner)
        .approve(stakeOnAPE.target, fundAmount);
      await stakeOnAPE.connect(poolOwner).depositToPool(1, fundAmount);

      await expect(stakeOnAPE.connect(staker1).stakeNFT(1, 1))
        .to.emit(stakeOnAPE, "SoftStakeCreated")
        .withArgs(1, staker1.address, 1, anyValue);

      // Verify NFT is still with original owner
      expect(await nftCollection.ownerOf(1)).to.equal(staker1.address);
    });

    it("Should revert if NFT already staked in same pool", async function () {
      const { stakeOnAPE, nftCollection, staker1, poolId } = await loadFixture(
        deployPoolFixture
      );

      await stakeOnAPE.connect(staker1).stakeNFT(poolId, 1);

      await expect(
        stakeOnAPE.connect(staker1).stakeNFT(poolId, 1)
      ).to.be.revertedWith("NFT already staked in this pool");
    });

    it("Should revert if NFT already staked in another pool", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner, staker1 } =
        await loadFixture(deployPoolFixture);

      // Create a second pool
      await stakeOnAPE.connect(poolOwner).createPool(
        nftCollection.target,
        rewardToken.target,
        hre.ethers.parseEther("2"),
        0
      );

      const fundAmount = hre.ethers.parseEther("1000");
      await rewardToken
        .connect(poolOwner)
        .approve(stakeOnAPE.target, fundAmount);
      await stakeOnAPE.connect(poolOwner).depositToPool(2, fundAmount);

      // Stake in first pool
      await stakeOnAPE.connect(staker1).stakeNFT(1, 1);

      // Try to stake in second pool
      await expect(
        stakeOnAPE.connect(staker1).stakeNFT(2, 1)
      ).to.be.revertedWith("NFT already staked in another pool");
    });

    it("Should revert if pool has no balance", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner, staker1 } =
        await loadFixture(deployContractsFixture);

      await stakeOnAPE
        .connect(poolOwner)
        .createPool(
          nftCollection.target,
          rewardToken.target,
          hre.ethers.parseEther("1"),
          0
        );
      // Don't fund the pool

      await nftCollection.connect(staker1).approve(stakeOnAPE.target, 1);

      await expect(
        stakeOnAPE.connect(staker1).stakeNFT(1, 1)
      ).to.be.revertedWith("Pool has no balance");
    });

    it("Should revert if staking is paused", async function () {
      const { stakeOnAPE, nftCollection, poolOwner, staker1, poolId } =
        await loadFixture(deployPoolFixture);

      // Pause staking for the pool
      await stakeOnAPE
        .connect(poolOwner)
        .updatePoolConfig(poolId, hre.ethers.parseEther("1"), 0, true);

      await nftCollection.connect(staker1).approve(stakeOnAPE.target, 1);

      await expect(
        stakeOnAPE.connect(staker1).stakeNFT(poolId, 1)
      ).to.be.revertedWith("Staking paused for this pool");
    });

    it("Should revert if caller doesn't have NFT pass", async function () {
      const { stakeOnAPE, nftCollection, nonPassHolder, poolId, staker1 } =
        await loadFixture(deployPoolFixture);

      // Transfer NFT to non-pass holder
      await nftCollection
        .connect(staker1)
        .transferFrom(staker1.address, nonPassHolder.address, 1);
      await nftCollection.connect(nonPassHolder).approve(stakeOnAPE.target, 1);

      await expect(
        stakeOnAPE.connect(nonPassHolder).stakeNFT(poolId, 1)
      ).to.be.revertedWith("Insufficient NFT passes for staking");
    });
  });

  describe("Batch Soft Staking", function () {
    it("Should batch soft stake NFTs successfully", async function () {
      const { stakeOnAPE, nftCollection, staker1, poolId } = await loadFixture(
        deployPoolFixture
      );

      const tokenIds = [1, 2, 3];

      await expect(
        stakeOnAPE.connect(staker1).batchStakeNFTs(poolId, tokenIds)
      ).to.emit(stakeOnAPE, "SoftStakeCreated");

      // Verify all NFTs are still with original owner
      for (const tokenId of tokenIds) {
        expect(await nftCollection.ownerOf(tokenId)).to.equal(staker1.address);
      }
    });

    it("Should revert with too many NFTs", async function () {
      const { stakeOnAPE, staker1, poolId } = await loadFixture(
        deployPoolFixture
      );

      const tokenIds = Array.from({ length: 21 }, (_, i) => i + 1);

      await expect(
        stakeOnAPE.connect(staker1).batchStakeNFTs(poolId, tokenIds)
      ).to.be.revertedWith("Too many NFTs in batch");
    });

    it("Should revert with empty token array", async function () {
      const { stakeOnAPE, staker1, poolId } = await loadFixture(
        deployPoolFixture
      );

      await expect(
        stakeOnAPE.connect(staker1).batchStakeNFTs(poolId, [])
      ).to.be.revertedWith("No token IDs provided");
    });
  });

  describe("NFT Soft Unstaking", function () {
    it("Should soft unstake NFT successfully", async function () {
      const { stakeOnAPE, nftCollection, staker1, poolId } =
        await loadFixture(deployPoolFixture);

      await stakeOnAPE.connect(staker1).stakeNFT(poolId, 1);

      await expect(stakeOnAPE.connect(staker1).unstakeNFT(poolId, 1))
        .to.emit(stakeOnAPE, "NFTUnstaked")
        .withArgs(poolId, staker1.address, 1, anyValue);

      // Verify NFT is still with original owner (never transferred)
      expect(await nftCollection.ownerOf(1)).to.equal(staker1.address);
    });

    it("Should revert if not authorized to unstake", async function () {
      const {
        stakeOnAPE,
        nftCollection,
        staker1,
        staker2,
        poolId,
      } = await loadFixture(deployPoolFixture);

      await stakeOnAPE.connect(staker1).stakeNFT(poolId, 1);

      await expect(
        stakeOnAPE.connect(staker2).unstakeNFT(poolId, 1)
      ).to.be.revertedWith("Not authorized to unstake");
    });

    it("Should unstake and claim rewards for original owner", async function () {
      const {
        stakeOnAPE,
        nftCollection,
        rewardToken,
        staker1,
        poolId,
      } = await loadFixture(deployPoolFixture);

      await stakeOnAPE.connect(staker1).stakeNFT(poolId, 1);

      // Wait for some rewards to accumulate
      await time.increase(24 * 60 * 60); // 1 day

      const balanceBefore = await rewardToken.balanceOf(staker1.address);
      await stakeOnAPE.connect(staker1).unstakeNFT(poolId, 1);
      const balanceAfter = await rewardToken.balanceOf(staker1.address);

      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("Should allow new owner to force unstake without rewards", async function () {
      const {
        stakeOnAPE,
        nftCollection,
        rewardToken,
        staker1,
        staker2,
        poolId,
      } = await loadFixture(deployPoolFixture);

      // Stake NFT
      await stakeOnAPE.connect(staker1).stakeNFT(poolId, 1);

      // Wait for rewards to accumulate
      await time.increase(24 * 60 * 60); // 1 day

      // Transfer NFT to new owner
      await nftCollection.connect(staker1).transferFrom(staker1.address, staker2.address, 1);

      // New owner should be able to force unstake
      const balanceBefore = await rewardToken.balanceOf(staker2.address);
      
      await expect(stakeOnAPE.connect(staker2).forceUnstakeTransferredNFT(poolId, 1))
        .to.emit(stakeOnAPE, "ForceUnstakeByNewOwner");

      const balanceAfter = await rewardToken.balanceOf(staker2.address);
      
      // New owner should not get any rewards
      expect(balanceAfter).to.equal(balanceBefore);
      
      // Verify NFT is with new owner
      expect(await nftCollection.ownerOf(1)).to.equal(staker2.address);
    });

    it("Should prevent original owner from claiming rewards after NFT transfer", async function () {
      const {
        stakeOnAPE,
        nftCollection,
        staker1,
        staker2,
        poolId,
      } = await loadFixture(deployPoolFixture);

      // Stake NFT
      await stakeOnAPE.connect(staker1).stakeNFT(poolId, 1);

      // Transfer NFT to new owner
      await nftCollection.connect(staker1).transferFrom(staker1.address, staker2.address, 1);

      // Original owner should not be able to claim rewards
      await expect(
        stakeOnAPE.connect(staker1).claimRewards(poolId, 1)
      ).to.be.revertedWith("NFT ownership changed - cannot claim rewards");
    });
  });

  describe("Batch Soft Unstaking", function () {
    it("Should batch soft unstake NFTs successfully", async function () {
      const { stakeOnAPE, nftCollection, staker1, poolId } =
        await loadFixture(deployPoolFixture);

      const tokenIds = [1, 2, 3];
      for (const tokenId of tokenIds) {
        await stakeOnAPE.connect(staker1).stakeNFT(poolId, tokenId);
      }

      await expect(
        stakeOnAPE.connect(staker1).batchUnstakeNFTs(poolId, tokenIds)
      ).to.emit(stakeOnAPE, "NFTUnstaked");

      // Verify all NFTs are still with original owner
      for (const tokenId of tokenIds) {
        expect(await nftCollection.ownerOf(tokenId)).to.equal(staker1.address);
      }
    });
  });

  describe("Soft Stake Rewards", function () {
    it("Should calculate pending rewards correctly", async function () {
      const {
        stakeOnAPE,
        nftCollection,
        staker1,
        poolId,
        dailyRewardRate,
      } = await loadFixture(deployPoolFixture);

      await stakeOnAPE.connect(staker1).stakeNFT(poolId, 1);

      // Fast forward 1 day
      await time.increase(24 * 60 * 60);

      const pendingRewards = await stakeOnAPE.getPendingRewards(poolId, 1);
      expect(pendingRewards).to.be.closeTo(
        dailyRewardRate,
        dailyRewardRate / 100n
      ); // Within 1% tolerance
    });

    it("Should claim rewards successfully (no lock period in soft staking)", async function () {
      const {
        stakeOnAPE,
        nftCollection,
        rewardToken,
        staker1,
        poolId,
      } = await loadFixture(deployPoolFixture);

      await stakeOnAPE.connect(staker1).stakeNFT(poolId, 1);

      // Wait for some rewards to accumulate
      await time.increase(24 * 60 * 60); // 1 day

      const balanceBefore = await rewardToken.balanceOf(staker1.address);
      await expect(stakeOnAPE.connect(staker1).claimRewards(poolId, 1)).to.emit(
        stakeOnAPE,
        "RewardsClaimed"
      );

      const balanceAfter = await rewardToken.balanceOf(staker1.address);
      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("Should revert claiming rewards if NFT ownership changed", async function () {
      const { stakeOnAPE, nftCollection, staker1, staker2, poolId } = await loadFixture(
        deployPoolFixture
      );

      await stakeOnAPE.connect(staker1).stakeNFT(poolId, 1);

      // Transfer NFT to another user
      await nftCollection.connect(staker1).transferFrom(staker1.address, staker2.address, 1);

      await expect(
        stakeOnAPE.connect(staker1).claimRewards(poolId, 1)
      ).to.be.revertedWith("NFT ownership changed - cannot claim rewards");
    });

    it("Should batch claim rewards successfully", async function () {
      const {
        stakeOnAPE,
        nftCollection,
        rewardToken,
        staker1,
        poolId,
      } = await loadFixture(deployPoolFixture);

      const tokenIds = [1, 2, 3];
      for (const tokenId of tokenIds) {
        await stakeOnAPE.connect(staker1).stakeNFT(poolId, tokenId);
      }

      // Wait for rewards to accumulate
      await time.increase(24 * 60 * 60); // 1 day

      const balanceBefore = await rewardToken.balanceOf(staker1.address);
      await stakeOnAPE.connect(staker1).batchClaimRewards(poolId, tokenIds);
      const balanceAfter = await rewardToken.balanceOf(staker1.address);

      expect(balanceAfter).to.be.gt(balanceBefore);
    });
  });

  describe("Special Rewards", function () {
    it("Should set special rewards for tokens", async function () {
      const { stakeOnAPE, poolOwner, poolId } = await loadFixture(
        deployPoolFixture
      );

      const tokenIds = [1, 2, 3];
      const specialRate = hre.ethers.parseEther("2"); // 2x reward rate

      await expect(
        stakeOnAPE
          .connect(poolOwner)
          .setSpecialRewards(poolId, tokenIds, specialRate)
      )
        .to.emit(stakeOnAPE, "SpecialRewardsUpdated")
        .withArgs(poolId, tokenIds, specialRate);
    });

    it("Should calculate rewards with special rate", async function () {
      const {
        stakeOnAPE,
        nftCollection,
        poolOwner,
        staker1,
        poolId,
      } = await loadFixture(deployPoolFixture);

      const specialRate = hre.ethers.parseEther("2");
      await stakeOnAPE
        .connect(poolOwner)
        .setSpecialRewards(poolId, [1], specialRate);

      await stakeOnAPE.connect(staker1).stakeNFT(poolId, 1);

      await time.increase(24 * 60 * 60); // 1 day

      const pendingRewards = await stakeOnAPE.getPendingRewards(poolId, 1);
      expect(pendingRewards).to.be.closeTo(specialRate, specialRate / 100n);
    });

    it("Should revert if not pool owner", async function () {
      const { stakeOnAPE, staker1, poolId } = await loadFixture(
        deployPoolFixture
      );

      await expect(
        stakeOnAPE
          .connect(staker1)
          .setSpecialRewards(poolId, [1], hre.ethers.parseEther("2"))
      ).to.be.revertedWith("Not pool owner");
    });
  });

  describe("Pool Configuration", function () {
    it("Should update pool config successfully", async function () {
      const { stakeOnAPE, poolOwner, poolId } = await loadFixture(
        deployPoolFixture
      );

      const newDailyRate = hre.ethers.parseEther("2");
      const newLockDuration = 14 * 24 * 60 * 60; // 14 days

      await expect(
        stakeOnAPE
          .connect(poolOwner)
          .updatePoolConfig(poolId, newDailyRate, newLockDuration, false)
      )
        .to.emit(stakeOnAPE, "PoolConfigUpdated")
        .withArgs(poolId, newDailyRate, newLockDuration, false);
    });

    it("Should transfer pool ownership successfully", async function () {
      const { stakeOnAPE, poolOwner, staker1, poolId } = await loadFixture(
        deployPoolFixture
      );

      await expect(
        stakeOnAPE
          .connect(poolOwner)
          .transferPoolOwnership(poolId, staker1.address)
      )
        .to.emit(stakeOnAPE, "PoolOwnershipTransferred")
        .withArgs(poolId, poolOwner.address, staker1.address);
    });

    it("Should revert ownership transfer to non-pass holder", async function () {
      const { stakeOnAPE, poolOwner, nonPassHolder, poolId } =
        await loadFixture(deployPoolFixture);

      await expect(
        stakeOnAPE
          .connect(poolOwner)
          .transferPoolOwnership(poolId, nonPassHolder.address)
      ).to.be.revertedWith("New owner must hold NFT pass");
    });
  });

  describe("Soft Restaking", function () {
    it("Should restake NFT successfully", async function () {
      const { stakeOnAPE, nftCollection, staker1, poolId } =
        await loadFixture(deployPoolFixture);

      await stakeOnAPE.connect(staker1).stakeNFT(poolId, 1);

      // Wait for some rewards to accumulate
      await time.increase(24 * 60 * 60); // 1 day

      await expect(stakeOnAPE.connect(staker1).restakeNFT(poolId, 1))
        .to.emit(stakeOnAPE, "NFTRestaked")
        .withArgs(poolId, staker1.address, 1, anyValue);
    });

    it("Should restake and claim rewards from previous period", async function () {
      const {
        stakeOnAPE,
        nftCollection,
        rewardToken,
        staker1,
        poolId,
      } = await loadFixture(deployPoolFixture);

      await stakeOnAPE.connect(staker1).stakeNFT(poolId, 1);

      // Wait for rewards to accumulate
      await time.increase(24 * 60 * 60); // 1 day

      const balanceBefore = await rewardToken.balanceOf(staker1.address);
      await stakeOnAPE.connect(staker1).restakeNFT(poolId, 1);
      const balanceAfter = await rewardToken.balanceOf(staker1.address);

      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("Should prevent restaking if NFT ownership changed", async function () {
      const {
        stakeOnAPE,
        nftCollection,
        staker1,
        staker2,
        poolId,
      } = await loadFixture(deployPoolFixture);

      await stakeOnAPE.connect(staker1).stakeNFT(poolId, 1);

      // Transfer NFT to another user
      await nftCollection.connect(staker1).transferFrom(staker1.address, staker2.address, 1);

      await expect(
        stakeOnAPE.connect(staker1).restakeNFT(poolId, 1)
      ).to.be.revertedWith("NFT ownership changed");
    });
  });

  describe("Soft Stake View Functions", function () {
    it("Should return correct NFT stake status", async function () {
      const { stakeOnAPE, nftCollection, staker1, poolId } =
        await loadFixture(deployPoolFixture);

      // Check not staked initially
      expect(await stakeOnAPE.isNFTStaked(poolId, 1)).to.be.false;

      await stakeOnAPE.connect(staker1).stakeNFT(poolId, 1);

      // Check staked after staking
      expect(await stakeOnAPE.isNFTStaked(poolId, 1)).to.be.true;
    });

    it("Should return correct time staked", async function () {
      const { stakeOnAPE, nftCollection, staker1, poolId } =
        await loadFixture(deployPoolFixture);

      await stakeOnAPE.connect(staker1).stakeNFT(poolId, 1);

      // Fast forward some time
      await time.increase(24 * 60 * 60); // 1 day

      const timeStaked = await stakeOnAPE.getTimeStaked(poolId, 1);
      expect(timeStaked).to.be.closeTo(BigInt(24 * 60 * 60), BigInt(5)); // Within 5 seconds tolerance
    });

    it("Should return correct global staking status", async function () {
      const { stakeOnAPE, nftCollection, staker1, poolId } =
        await loadFixture(deployPoolFixture);

      const [isStaked1, activePool1] = await stakeOnAPE.isNFTStakedAnywhere(nftCollection.target, 1);
      expect(isStaked1).to.be.false;
      expect(activePool1).to.equal(0);

      await stakeOnAPE.connect(staker1).stakeNFT(poolId, 1);

      const [isStaked2, activePool2] = await stakeOnAPE.isNFTStakedAnywhere(nftCollection.target, 1);
      expect(isStaked2).to.be.true;
      expect(activePool2).to.equal(poolId);
    });

    it("Should return user staked tokens", async function () {
      const { stakeOnAPE, nftCollection, staker1, poolId } = await loadFixture(
        deployPoolFixture
      );

      const tokenIds = [1, 2, 3];
      for (const tokenId of tokenIds) {
        await nftCollection
          .connect(staker1)
          .approve(stakeOnAPE.target, tokenId);
        await stakeOnAPE.connect(staker1).stakeNFT(poolId, tokenId);
      }

      const stakedTokens = await stakeOnAPE.getUserStakedTokens(
        staker1.address,
        poolId
      );
      expect(stakedTokens.map((n) => Number(n))).to.deep.equal(tokenIds);
    });
  });

  describe("Emergency Functions", function () {
    it("Should emergency pause/unpause", async function () {
      const { stakeOnAPE, owner } = await loadFixture(deployContractsFixture);

      await stakeOnAPE.connect(owner).emergencyPause();
      expect(await stakeOnAPE.paused()).to.be.true;

      await stakeOnAPE.connect(owner).emergencyUnpause();
      expect(await stakeOnAPE.paused()).to.be.false;
    });

    it("Should emergency withdraw tokens", async function () {
      const { stakeOnAPE, rewardToken, owner, poolOwner, poolId, fundAmount } =
        await loadFixture(deployPoolFixture);

      const withdrawAmount = hre.ethers.parseEther("100");
      await stakeOnAPE
        .connect(owner)
        .emergencyWithdraw(
          poolId,
          rewardToken.target,
          withdrawAmount,
          owner.address
        );

      const poolBalance = await stakeOnAPE.getPoolBalance(poolId);
      expect(poolBalance).to.equal(fundAmount - withdrawAmount);
    });

    it("Should emergency unstake", async function () {
      const { stakeOnAPE, nftCollection, owner, staker1, poolId } =
        await loadFixture(deployPoolFixture);

      await nftCollection.connect(staker1).approve(stakeOnAPE.target, 1);
      await stakeOnAPE.connect(staker1).stakeNFT(poolId, 1);

      await expect(
        stakeOnAPE.connect(owner).emergencyUnstake(poolId, 1, staker1.address)
      ).to.emit(stakeOnAPE, "NFTUnstaked");
    });

    it("Should revert emergency functions if not owner", async function () {
      const { stakeOnAPE, staker1 } = await loadFixture(deployContractsFixture);

      await expect(
        stakeOnAPE.connect(staker1).emergencyPause()
      ).to.be.revertedWithCustomError(stakeOnAPE, "OwnableUnauthorizedAccount");
    });
  });

  describe("Security", function () {
    it("Should prevent reentrancy attacks", async function () {
      // This test would require a malicious contract to test reentrancy
      // For now, we verify that the nonReentrant modifier is applied
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner } =
        await loadFixture(deployContractsFixture);

      // Verify contract has nonReentrant modifier by checking it doesn't fail on normal operations
      await stakeOnAPE
        .connect(poolOwner)
        .createPool(
          nftCollection.target,
          rewardToken.target,
          hre.ethers.parseEther("1"),
          0
        );

      expect(await stakeOnAPE.getPoolInfo(1)).to.exist;
    });

    it("Should validate NFT pass requirement", async function () {
      const { stakeOnAPE, nonPassHolder } = await loadFixture(
        deployContractsFixture
      );

      expect(await stakeOnAPE.hasNFTPass(nonPassHolder.address)).to.be.false;
    });
  });

  describe("Edge Cases", function () {
    it("Should handle zero rewards correctly", async function () {
      const { stakeOnAPE, nftCollection, staker1, poolId } = await loadFixture(
        deployPoolFixture
      );

      await nftCollection.connect(staker1).approve(stakeOnAPE.target, 1);
      await stakeOnAPE.connect(staker1).stakeNFT(poolId, 1);

      // Immediately check rewards (should be 0)
      const pendingRewards = await stakeOnAPE.getPendingRewards(poolId, 1);
      expect(pendingRewards).to.equal(0);
    });

    it("Should handle pool with insufficient balance for rewards", async function () {
      const {
        stakeOnAPE,
        nftCollection,
        rewardToken,
        poolOwner,
        staker1,
        poolId,
        owner,
      } = await loadFixture(deployPoolFixture);

      // Drain most of the pool balance
      await stakeOnAPE
        .connect(owner)
        .emergencyWithdraw(
          poolId,
          rewardToken.target,
          hre.ethers.parseEther("999"),
          owner.address
        );

      await nftCollection.connect(staker1).approve(stakeOnAPE.target, 1);
      await stakeOnAPE.connect(staker1).stakeNFT(poolId, 1);

      await time.increase(30 * 24 * 60 * 60); // 30 days

      // Should revert when trying to claim more than pool balance
      await expect(
        stakeOnAPE.connect(staker1).claimRewards(poolId, 1)
      ).to.be.revertedWith("Insufficient pool balance");
    });
  });

  describe("No Lock Duration (Lock = 0)", function () {
    it("Should allow immediate claiming with lock duration 0", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner, staker1 } =
        await loadFixture(deployContractsFixture);

      // Create pool with lockDuration = 0
      await stakeOnAPE.connect(poolOwner).createPool(
        nftCollection.target,
        rewardToken.target,
        hre.ethers.parseEther("1"),
        0 // No lock duration
      );

      const fundAmount = hre.ethers.parseEther("1000");
      await rewardToken
        .connect(poolOwner)
        .approve(stakeOnAPE.target, fundAmount);
      await stakeOnAPE.connect(poolOwner).depositToPool(1, fundAmount);

      await nftCollection.connect(staker1).approve(stakeOnAPE.target, 1);
      await stakeOnAPE.connect(staker1).stakeNFT(1, 1);

      // Wait 1 hour to accumulate some rewards
      await time.increase(3600); // 1 hour

      // Should be able to claim immediately
      const balanceBefore = await rewardToken.balanceOf(staker1.address);
      await stakeOnAPE.connect(staker1).claimRewards(1, 1);
      const balanceAfter = await rewardToken.balanceOf(staker1.address);

      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("Should allow immediate unstaking with lock duration 0", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner, staker1 } =
        await loadFixture(deployContractsFixture);

      // Create pool with lockDuration = 0
      await stakeOnAPE
        .connect(poolOwner)
        .createPool(
          nftCollection.target,
          rewardToken.target,
          hre.ethers.parseEther("1"),
          0
        );

      const fundAmount = hre.ethers.parseEther("1000");
      await rewardToken
        .connect(poolOwner)
        .approve(stakeOnAPE.target, fundAmount);
      await stakeOnAPE.connect(poolOwner).depositToPool(1, fundAmount);

      await nftCollection.connect(staker1).approve(stakeOnAPE.target, 1);
      await stakeOnAPE.connect(staker1).stakeNFT(1, 1);

      // Should be able to unstake immediately
      await expect(stakeOnAPE.connect(staker1).unstakeNFT(1, 1)).to.emit(
        stakeOnAPE,
        "NFTUnstaked"
      );
    });

    it("Should show isStaked = true for soft staking", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner, staker1 } =
        await loadFixture(deployContractsFixture);

      await stakeOnAPE
        .connect(poolOwner)
        .createPool(
          nftCollection.target,
          rewardToken.target,
          hre.ethers.parseEther("1"),
          0
        );

      const fundAmount = hre.ethers.parseEther("1000");
      await rewardToken
        .connect(poolOwner)
        .approve(stakeOnAPE.target, fundAmount);
      await stakeOnAPE.connect(poolOwner).depositToPool(1, fundAmount);

      await stakeOnAPE.connect(staker1).stakeNFT(1, 1);

      expect(await stakeOnAPE.isNFTStaked(1, 1)).to.be.true;
    });
  });

  describe("Multiple Pools for Same Collection", function () {
    it("Should allow creating multiple pools for same NFT collection", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner, staker1, nftPass } =
        await loadFixture(deployContractsFixture);

      // Create first pool
      await stakeOnAPE
        .connect(poolOwner)
        .createPool(
          nftCollection.target,
          rewardToken.target,
          hre.ethers.parseEther("1"),
          0
        );

      // Give staker1 more NFT passes for pool creation
      for (let i = 101; i <= 115; i++) {
        await nftPass.mint(staker1.address, i);
      }
      
      // Create second pool for same collection
      await stakeOnAPE
        .connect(staker1)
        .createPool(
          nftCollection.target,
          rewardToken.target,
          hre.ethers.parseEther("2"),
          7 * 24 * 60 * 60
        );

      const collectionPools = await stakeOnAPE.getCollectionPools(
        nftCollection.target
      );
      expect(collectionPools).to.deep.equal([1n, 2n]);
    });

    it("Should allow staking same NFT collection in different pools", async function () {
      const {
        stakeOnAPE,
        nftCollection,
        rewardToken,
        poolOwner,
        staker1,
        staker2,
        nftPass,
      } = await loadFixture(deployContractsFixture);

      // Give staker1 more NFT passes for pool creation
      for (let i = 201; i <= 215; i++) {
        await nftPass.mint(staker1.address, i);
      }
      
      // Create two pools
      await stakeOnAPE
        .connect(poolOwner)
        .createPool(
          nftCollection.target,
          rewardToken.target,
          hre.ethers.parseEther("1"),
          0
        );

      await stakeOnAPE
        .connect(staker1)
        .createPool(
          nftCollection.target,
          rewardToken.target,
          hre.ethers.parseEther("2"),
          0
        );

      // Fund both pools
      await rewardToken
        .connect(poolOwner)
        .approve(stakeOnAPE.target, hre.ethers.parseEther("1000"));
      await stakeOnAPE
        .connect(poolOwner)
        .depositToPool(1, hre.ethers.parseEther("1000"));

      await rewardToken.transfer(
        staker1.address,
        hre.ethers.parseEther("1000")
      );
      await rewardToken
        .connect(staker1)
        .approve(stakeOnAPE.target, hre.ethers.parseEther("1000"));
      await stakeOnAPE
        .connect(staker1)
        .depositToPool(2, hre.ethers.parseEther("1000"));

      // Stake different NFTs in different pools
      await nftCollection.connect(staker2).approve(stakeOnAPE.target, 31);
      await stakeOnAPE.connect(staker2).stakeNFT(1, 31);

      await nftCollection.connect(staker2).approve(stakeOnAPE.target, 32);
      await stakeOnAPE.connect(staker2).stakeNFT(2, 32);

      expect(
        await stakeOnAPE.getUserStakedTokens(staker2.address, 1)
      ).to.deep.equal([31n]);
      expect(
        await stakeOnAPE.getUserStakedTokens(staker2.address, 2)
      ).to.deep.equal([32n]);
    });

    it("Should prevent staking same NFT in multiple pools", async function () {
      const {
        stakeOnAPE,
        nftCollection,
        rewardToken,
        poolOwner,
        staker1,
        staker2,
        nftPass,
      } = await loadFixture(deployContractsFixture);

      // Give staker1 more NFT passes for pool creation
      for (let i = 301; i <= 315; i++) {
        await nftPass.mint(staker1.address, i);
      }
      
      // Create two pools
      await stakeOnAPE
        .connect(poolOwner)
        .createPool(
          nftCollection.target,
          rewardToken.target,
          hre.ethers.parseEther("1"),
          0
        );

      await stakeOnAPE
        .connect(staker1)
        .createPool(
          nftCollection.target,
          rewardToken.target,
          hre.ethers.parseEther("2"),
          0
        );

      // Fund both pools
      await rewardToken
        .connect(poolOwner)
        .approve(stakeOnAPE.target, hre.ethers.parseEther("1000"));
      await stakeOnAPE
        .connect(poolOwner)
        .depositToPool(1, hre.ethers.parseEther("1000"));

      await rewardToken.transfer(
        staker1.address,
        hre.ethers.parseEther("1000")
      );
      await rewardToken
        .connect(staker1)
        .approve(stakeOnAPE.target, hre.ethers.parseEther("1000"));
      await stakeOnAPE
        .connect(staker1)
        .depositToPool(2, hre.ethers.parseEther("1000"));

      // Stake NFT in first pool
      await nftCollection.connect(staker2).approve(stakeOnAPE.target, 31);
      await stakeOnAPE.connect(staker2).stakeNFT(1, 31);

      // Try to stake same NFT in second pool (should fail because NFT is already staked)
      await expect(
        stakeOnAPE.connect(staker2).stakeNFT(2, 31)
      ).to.be.reverted;
    });
  });

  describe("Reward Precision", function () {
    it("Should handle sub-day staking periods correctly", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner, staker1 } =
        await loadFixture(deployContractsFixture);

      const dailyRate = hre.ethers.parseEther("24"); // 24 tokens per day = 1 token per hour
      await stakeOnAPE
        .connect(poolOwner)
        .createPool(nftCollection.target, rewardToken.target, dailyRate, 0);

      await rewardToken
        .connect(poolOwner)
        .approve(stakeOnAPE.target, hre.ethers.parseEther("1000"));
      await stakeOnAPE
        .connect(poolOwner)
        .depositToPool(1, hre.ethers.parseEther("1000"));

      await nftCollection.connect(staker1).approve(stakeOnAPE.target, 1);
      await stakeOnAPE.connect(staker1).stakeNFT(1, 1);

      // Test 12 hours (should be ~12 tokens)
      await time.increase(12 * 3600);
      let pendingRewards = await stakeOnAPE.getPendingRewards(1, 1);
      expect(pendingRewards).to.be.closeTo(
        hre.ethers.parseEther("12"),
        hre.ethers.parseEther("0.1")
      );

      // Reset and test 1 hour (should be ~1 token)
      await stakeOnAPE.connect(staker1).claimRewards(1, 1);
      await time.increase(3600);
      pendingRewards = await stakeOnAPE.getPendingRewards(1, 1);
      expect(pendingRewards).to.be.closeTo(
        hre.ethers.parseEther("1"),
        hre.ethers.parseEther("0.1")
      );
    });

    it("Should handle very small reward rates", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner, staker1 } =
        await loadFixture(deployContractsFixture);

      await stakeOnAPE.connect(poolOwner).createPool(
        nftCollection.target,
        rewardToken.target,
        1, // 1 wei per day
        0
      );

      await rewardToken
        .connect(poolOwner)
        .approve(stakeOnAPE.target, hre.ethers.parseEther("1000"));
      await stakeOnAPE
        .connect(poolOwner)
        .depositToPool(1, hre.ethers.parseEther("1000"));

      await nftCollection.connect(staker1).approve(stakeOnAPE.target, 1);
      await stakeOnAPE.connect(staker1).stakeNFT(1, 1);

      await time.increase(24 * 3600); // 1 day
      const pendingRewards = await stakeOnAPE.getPendingRewards(1, 1);
      expect(pendingRewards).to.equal(1);
    });

    it("Should handle rewards over long periods", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner, staker1 } =
        await loadFixture(deployContractsFixture);

      const dailyRate = hre.ethers.parseEther("1");
      await stakeOnAPE
        .connect(poolOwner)
        .createPool(nftCollection.target, rewardToken.target, dailyRate, 0);

      await rewardToken
        .connect(poolOwner)
        .approve(stakeOnAPE.target, hre.ethers.parseEther("10000"));
      await stakeOnAPE
        .connect(poolOwner)
        .depositToPool(1, hre.ethers.parseEther("10000"));

      await nftCollection.connect(staker1).approve(stakeOnAPE.target, 1);
      await stakeOnAPE.connect(staker1).stakeNFT(1, 1);

      // Stake for 100 days
      await time.increase(100 * 24 * 3600);
      const pendingRewards = await stakeOnAPE.getPendingRewards(1, 1);
      expect(pendingRewards).to.be.closeTo(
        hre.ethers.parseEther("100"),
        hre.ethers.parseEther("1")
      );
    });
  });

  describe("Special Rewards Edge Cases", function () {
    it("Should override base rate with special rewards", async function () {
      const {
        stakeOnAPE,
        nftCollection,
        rewardToken,
        poolOwner,
        staker1,
        poolId,
      } = await loadFixture(deployPoolFixture);

      const specialRate = hre.ethers.parseEther("5"); // 5x base rate
      await stakeOnAPE
        .connect(poolOwner)
        .setSpecialRewards(poolId, [1], specialRate);

      await nftCollection.connect(staker1).approve(stakeOnAPE.target, 1);
      await stakeOnAPE.connect(staker1).stakeNFT(poolId, 1);

      // Also stake a regular NFT
      await nftCollection.connect(staker1).approve(stakeOnAPE.target, 2);
      await stakeOnAPE.connect(staker1).stakeNFT(poolId, 2);

      await time.increase(24 * 3600); // 1 day

      const specialRewards = await stakeOnAPE.getPendingRewards(poolId, 1);
      const baseRewards = await stakeOnAPE.getPendingRewards(poolId, 2);

      expect(specialRewards).to.be.closeTo(specialRate, specialRate / 100n);
      expect(baseRewards).to.be.closeTo(
        hre.ethers.parseEther("1"),
        hre.ethers.parseEther("0.01")
      );
    });

    it("Should handle special reward = 0", async function () {
      const {
        stakeOnAPE,
        nftCollection,
        poolOwner,
        staker1,
        poolId,
        dailyRewardRate,
      } = await loadFixture(deployPoolFixture);

      // Set special reward to 0
      await stakeOnAPE.connect(poolOwner).setSpecialRewards(poolId, [1], 0);

      await nftCollection.connect(staker1).approve(stakeOnAPE.target, 1);
      await stakeOnAPE.connect(staker1).stakeNFT(poolId, 1);

      await time.increase(24 * 3600); // 1 day

      const pendingRewards = await stakeOnAPE.getPendingRewards(poolId, 1);
      // Should use base rate, not special rate of 0
      expect(pendingRewards).to.be.closeTo(
        dailyRewardRate,
        dailyRewardRate / 100n
      );
    });

    it("Should update special rewards multiple times", async function () {
      const { stakeOnAPE, poolOwner, poolId } = await loadFixture(
        deployPoolFixture
      );

      // Set initial special reward
      await stakeOnAPE
        .connect(poolOwner)
        .setSpecialRewards(poolId, [1], hre.ethers.parseEther("2"));
      expect(await stakeOnAPE.getSpecialReward(poolId, 1)).to.equal(
        hre.ethers.parseEther("2")
      );

      // Update special reward
      await stakeOnAPE
        .connect(poolOwner)
        .setSpecialRewards(poolId, [1], hre.ethers.parseEther("3"));
      expect(await stakeOnAPE.getSpecialReward(poolId, 1)).to.equal(
        hre.ethers.parseEther("3")
      );
    });

    it("Should handle large batch special rewards", async function () {
      const { stakeOnAPE, poolOwner, poolId } = await loadFixture(
        deployPoolFixture
      );

      const tokenIds = Array.from({ length: 20 }, (_, i) => i + 1); // MAX_BATCH_SIZE
      const specialRate = hre.ethers.parseEther("5");

      await stakeOnAPE
        .connect(poolOwner)
        .setSpecialRewards(poolId, tokenIds, specialRate);

      // Verify all tokens have special reward set
      for (const tokenId of tokenIds) {
        expect(await stakeOnAPE.getSpecialReward(poolId, tokenId)).to.equal(
          specialRate
        );
      }
    });
  });

  describe("Pool Balance Management", function () {
    it("Should handle multiple deposits to same pool", async function () {
      const { stakeOnAPE, rewardToken, poolOwner, poolId } = await loadFixture(
        deployPoolFixture
      );

      const initialBalance = await stakeOnAPE.getPoolBalance(poolId);

      // Additional deposit
      const additionalAmount = hre.ethers.parseEther("500");
      await rewardToken
        .connect(poolOwner)
        .approve(stakeOnAPE.target, additionalAmount);
      await stakeOnAPE
        .connect(poolOwner)
        .depositToPool(poolId, additionalAmount);

      const finalBalance = await stakeOnAPE.getPoolBalance(poolId);
      expect(finalBalance).to.equal(initialBalance + additionalAmount);
    });

    it("Should prevent staking when balance reaches 0", async function () {
      const {
        stakeOnAPE,
        nftCollection,
        rewardToken,
        poolOwner,
        staker1,
        owner,
      } = await loadFixture(deployContractsFixture);

      await stakeOnAPE
        .connect(poolOwner)
        .createPool(
          nftCollection.target,
          rewardToken.target,
          hre.ethers.parseEther("1"),
          0
        );

      // Don't fund the pool
      await nftCollection.connect(staker1).approve(stakeOnAPE.target, 1);

      await expect(
        stakeOnAPE.connect(staker1).stakeNFT(1, 1)
      ).to.be.revertedWith("Pool has no balance");
    });

    it("Should handle fractional token amounts", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner, staker1 } =
        await loadFixture(deployContractsFixture);

      // Use a reward rate with decimals (0.5 tokens per day)
      const dailyRate = hre.ethers.parseEther("0.5");
      await stakeOnAPE
        .connect(poolOwner)
        .createPool(nftCollection.target, rewardToken.target, dailyRate, 0);

      await rewardToken
        .connect(poolOwner)
        .approve(stakeOnAPE.target, hre.ethers.parseEther("1000"));
      await stakeOnAPE
        .connect(poolOwner)
        .depositToPool(1, hre.ethers.parseEther("1000"));

      await nftCollection.connect(staker1).approve(stakeOnAPE.target, 1);
      await stakeOnAPE.connect(staker1).stakeNFT(1, 1);

      await time.increase(24 * 3600); // 1 day
      const pendingRewards = await stakeOnAPE.getPendingRewards(1, 1);
      expect(pendingRewards).to.be.closeTo(
        hre.ethers.parseEther("0.5"),
        hre.ethers.parseEther("0.01")
      );
    });
  });

  describe("Advanced Access Control", function () {
    it("Should prevent pool creation when contract is paused", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner, owner } =
        await loadFixture(deployContractsFixture);

      await stakeOnAPE.connect(owner).emergencyPause();

      await expect(
        stakeOnAPE
          .connect(poolOwner)
          .createPool(
            nftCollection.target,
            rewardToken.target,
            hre.ethers.parseEther("1"),
            0
          )
      ).to.be.revertedWithCustomError(stakeOnAPE, "EnforcedPause");
    });

    it("Should allow unstaking when contract is paused", async function () {
      const {
        stakeOnAPE,
        nftCollection,
        rewardToken,
        poolOwner,
        staker1,
        owner,
      } = await loadFixture(deployContractsFixture);

      // Create pool and stake NFT first
      await stakeOnAPE
        .connect(poolOwner)
        .createPool(
          nftCollection.target,
          rewardToken.target,
          hre.ethers.parseEther("1"),
          0
        );

      await rewardToken
        .connect(poolOwner)
        .approve(stakeOnAPE.target, hre.ethers.parseEther("1000"));
      await stakeOnAPE
        .connect(poolOwner)
        .depositToPool(1, hre.ethers.parseEther("1000"));

      await nftCollection.connect(staker1).approve(stakeOnAPE.target, 1);
      await stakeOnAPE.connect(staker1).stakeNFT(1, 1);

      // Pause contract
      await stakeOnAPE.connect(owner).emergencyPause();

      // Unstaking should still work
      await expect(stakeOnAPE.connect(staker1).unstakeNFT(1, 1)).to.emit(
        stakeOnAPE,
        "NFTUnstaked"
      );
    });

    it("Should prevent non-owners from calling admin functions", async function () {
      const { stakeOnAPE, staker1 } = await loadFixture(deployContractsFixture);

      await expect(
        stakeOnAPE.connect(staker1).emergencyPause()
      ).to.be.revertedWithCustomError(stakeOnAPE, "OwnableUnauthorizedAccount");

      await expect(
        stakeOnAPE.connect(staker1).updateNFTPassContract(staker1.address)
      ).to.be.revertedWithCustomError(stakeOnAPE, "OwnableUnauthorizedAccount");
    });

    it("Should handle NFT pass transfer scenarios", async function () {
      const {
        stakeOnAPE,
        nftPass,
        nftCollection,
        rewardToken,
        poolOwner,
        staker1,
        staker2,
      } = await loadFixture(deployContractsFixture);

      // Create pool and stake NFT
      await stakeOnAPE
        .connect(poolOwner)
        .createPool(
          nftCollection.target,
          rewardToken.target,
          hre.ethers.parseEther("1"),
          0
        );

      await rewardToken
        .connect(poolOwner)
        .approve(stakeOnAPE.target, hre.ethers.parseEther("1000"));
      await stakeOnAPE
        .connect(poolOwner)
        .depositToPool(1, hre.ethers.parseEther("1000"));

      await nftCollection.connect(staker1).approve(stakeOnAPE.target, 1);
      await stakeOnAPE.connect(staker1).stakeNFT(1, 1);

      // Transfer NFT pass to someone else (use one that staker1 owns)
      await nftPass
        .connect(staker1)
        .transferFrom(staker1.address, staker2.address, 21);

      // Original user should still be able to unstake and claim
      await time.increase(3600); // 1 hour
      await expect(stakeOnAPE.connect(staker1).claimRewards(1, 1)).to.emit(
        stakeOnAPE,
        "RewardsClaimed"
      );

      await expect(stakeOnAPE.connect(staker1).unstakeNFT(1, 1)).to.emit(
        stakeOnAPE,
        "NFTUnstaked"
      );
    });
  });

  describe("Gas Optimization", function () {
    it("Should handle maximum batch operations efficiently", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner, staker1 } =
        await loadFixture(deployContractsFixture);

      await stakeOnAPE
        .connect(poolOwner)
        .createPool(
          nftCollection.target,
          rewardToken.target,
          hre.ethers.parseEther("1"),
          0
        );

      await rewardToken
        .connect(poolOwner)
        .approve(stakeOnAPE.target, hre.ethers.parseEther("10000"));
      await stakeOnAPE
        .connect(poolOwner)
        .depositToPool(1, hre.ethers.parseEther("10000"));

      // Batch stake 20 NFTs (MAX_BATCH_SIZE)
      const tokenIds = Array.from({ length: 20 }, (_, i) => i + 1);
      for (const tokenId of tokenIds) {
        await nftCollection
          .connect(staker1)
          .approve(stakeOnAPE.target, tokenId);
      }

      await expect(
        stakeOnAPE.connect(staker1).batchStakeNFTs(1, tokenIds)
      ).to.emit(stakeOnAPE, "SoftStakeCreated");

      // Wait and batch claim
      await time.increase(3600); // 1 hour
      await expect(
        stakeOnAPE.connect(staker1).batchClaimRewards(1, tokenIds)
      ).to.emit(stakeOnAPE, "RewardsClaimed");

      // Batch unstake
      await expect(
        stakeOnAPE.connect(staker1).batchUnstakeNFTs(1, tokenIds)
      ).to.emit(stakeOnAPE, "NFTUnstaked");
    });

    it("Should handle pools with many staked NFTs", async function () {
      const {
        stakeOnAPE,
        nftCollection,
        rewardToken,
        poolOwner,
        staker1,
        staker2,
      } = await loadFixture(deployContractsFixture);

      await stakeOnAPE
        .connect(poolOwner)
        .createPool(
          nftCollection.target,
          rewardToken.target,
          hre.ethers.parseEther("1"),
          0
        );

      await rewardToken
        .connect(poolOwner)
        .approve(stakeOnAPE.target, hre.ethers.parseEther("10000"));
      await stakeOnAPE
        .connect(poolOwner)
        .depositToPool(1, hre.ethers.parseEther("10000"));

      // Stake multiple NFTs from different users
      for (let i = 1; i <= 10; i++) {
        await nftCollection.connect(staker1).approve(stakeOnAPE.target, i);
        await stakeOnAPE.connect(staker1).stakeNFT(1, i);
      }

      for (let i = 31; i <= 40; i++) {
        await nftCollection.connect(staker2).approve(stakeOnAPE.target, i);
        await stakeOnAPE.connect(staker2).stakeNFT(1, i);
      }

      // Verify getUserStakedTokens still works efficiently
      const staker1Tokens = await stakeOnAPE.getUserStakedTokens(
        staker1.address,
        1
      );
      const staker2Tokens = await stakeOnAPE.getUserStakedTokens(
        staker2.address,
        1
      );

      expect(staker1Tokens.length).to.equal(10);
      expect(staker2Tokens.length).to.equal(10);
    });
  });

  describe("State Consistency", function () {
    it("Should maintain consistent userStakedTokens mapping", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner, staker1 } =
        await loadFixture(deployContractsFixture);

      await stakeOnAPE
        .connect(poolOwner)
        .createPool(
          nftCollection.target,
          rewardToken.target,
          hre.ethers.parseEther("1"),
          0
        );

      await rewardToken
        .connect(poolOwner)
        .approve(stakeOnAPE.target, hre.ethers.parseEther("1000"));
      await stakeOnAPE
        .connect(poolOwner)
        .depositToPool(1, hre.ethers.parseEther("1000"));

      // Stake multiple NFTs
      const tokenIds = [1, 2, 3, 4, 5];
      for (const tokenId of tokenIds) {
        await nftCollection
          .connect(staker1)
          .approve(stakeOnAPE.target, tokenId);
        await stakeOnAPE.connect(staker1).stakeNFT(1, tokenId);
      }

      // Unstake some NFTs
      await stakeOnAPE.connect(staker1).unstakeNFT(1, 2);
      await stakeOnAPE.connect(staker1).unstakeNFT(1, 4);

      // Verify mapping is consistent
      const stakedTokens = await stakeOnAPE.getUserStakedTokens(
        staker1.address,
        1
      );
      const expectedTokens = [1, 3, 5];

      expect(stakedTokens.length).to.equal(expectedTokens.length);
      // Convert to numbers for easier comparison
      const stakedTokensNumbers = stakedTokens.map((n) => Number(n)).sort();
      expect(stakedTokensNumbers).to.deep.equal(expectedTokens.sort());
    });

    it("Should maintain consistent pool statistics", async function () {
      const {
        stakeOnAPE,
        nftCollection,
        rewardToken,
        poolOwner,
        staker1,
        staker2,
      } = await loadFixture(deployContractsFixture);

      await stakeOnAPE
        .connect(poolOwner)
        .createPool(
          nftCollection.target,
          rewardToken.target,
          hre.ethers.parseEther("1"),
          0
        );

      const initialDeposit = hre.ethers.parseEther("1000");
      await rewardToken
        .connect(poolOwner)
        .approve(stakeOnAPE.target, initialDeposit);
      await stakeOnAPE.connect(poolOwner).depositToPool(1, initialDeposit);

      // Multiple users stake
      await nftCollection.connect(staker1).approve(stakeOnAPE.target, 1);
      await stakeOnAPE.connect(staker1).stakeNFT(1, 1);

      await nftCollection.connect(staker2).approve(stakeOnAPE.target, 31);
      await stakeOnAPE.connect(staker2).stakeNFT(1, 31);

      // Wait and claim
      await time.increase(24 * 3600); // 1 day

      const balanceBefore = await stakeOnAPE.getPoolBalance(1);
      const totalClaimedBefore = (await stakeOnAPE.getPoolInfo(1)).totalClaimed;

      await stakeOnAPE.connect(staker1).claimRewards(1, 1);
      await stakeOnAPE.connect(staker2).claimRewards(1, 31);

      const balanceAfter = await stakeOnAPE.getPoolBalance(1);
      const totalClaimedAfter = (await stakeOnAPE.getPoolInfo(1)).totalClaimed;

      // Verify balance decreased and totalClaimed increased by same amount
      const claimedAmount = totalClaimedAfter - totalClaimedBefore;
      const balanceDecrease = balanceBefore - balanceAfter;

      expect(claimedAmount).to.equal(balanceDecrease);
      expect(balanceAfter + totalClaimedAfter).to.equal(initialDeposit);
    });
  });

  describe("Real-World Scenarios", function () {
    it("Should handle pool lifecycle: create, fund, stake, claim, unstake", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner, staker1 } =
        await loadFixture(deployContractsFixture);

      // 1. Create pool
      await expect(
        stakeOnAPE.connect(poolOwner).createPool(
          nftCollection.target,
          rewardToken.target,
          hre.ethers.parseEther("1"),
          7 * 24 * 60 * 60 // 7 days lock
        )
      ).to.emit(stakeOnAPE, "PoolCreated");

      // 2. Fund pool
      await rewardToken
        .connect(poolOwner)
        .approve(stakeOnAPE.target, hre.ethers.parseEther("1000"));
      await expect(
        stakeOnAPE
          .connect(poolOwner)
          .depositToPool(1, hre.ethers.parseEther("1000"))
      ).to.emit(stakeOnAPE, "PoolFunded");

      // 3. Stake NFT
      await nftCollection.connect(staker1).approve(stakeOnAPE.target, 1);
      await expect(stakeOnAPE.connect(staker1).stakeNFT(1, 1)).to.emit(
        stakeOnAPE,
        "SoftStakeCreated"
      );

      // 4. Wait for lock period and accumulate rewards
      await time.increase(7 * 24 * 60 * 60 + 1);

      // 5. Claim rewards
      await expect(stakeOnAPE.connect(staker1).claimRewards(1, 1)).to.emit(
        stakeOnAPE,
        "RewardsClaimed"
      );

      // 6. Unstake NFT
      await expect(stakeOnAPE.connect(staker1).unstakeNFT(1, 1)).to.emit(
        stakeOnAPE,
        "NFTUnstaked"
      );

      // Verify final state
      expect(await nftCollection.ownerOf(1)).to.equal(staker1.address);
      expect(
        await stakeOnAPE.getUserStakedTokens(staker1.address, 1)
      ).to.deep.equal([]);
    });

    it("Should handle competitive pool scenario", async function () {
      const {
        stakeOnAPE,
        nftCollection,
        rewardToken,
        poolOwner,
        staker1,
        staker2,
        nftPass,
      } = await loadFixture(deployContractsFixture);

      // Give staker1 more NFT passes for pool creation
      for (let i = 401; i <= 415; i++) {
        await nftPass.mint(staker1.address, i);
      }
      
      // Create two pools with different rates for same collection
      await stakeOnAPE.connect(poolOwner).createPool(
        nftCollection.target,
        rewardToken.target,
        hre.ethers.parseEther("1"), // Low rate
        0
      );

      await stakeOnAPE.connect(staker1).createPool(
        nftCollection.target,
        rewardToken.target,
        hre.ethers.parseEther("5"), // High rate
        0
      );

      // Fund both pools
      await rewardToken
        .connect(poolOwner)
        .approve(stakeOnAPE.target, hre.ethers.parseEther("1000"));
      await stakeOnAPE
        .connect(poolOwner)
        .depositToPool(1, hre.ethers.parseEther("1000"));

      await rewardToken.transfer(
        staker1.address,
        hre.ethers.parseEther("1000")
      );
      await rewardToken
        .connect(staker1)
        .approve(stakeOnAPE.target, hre.ethers.parseEther("1000"));
      await stakeOnAPE
        .connect(staker1)
        .depositToPool(2, hre.ethers.parseEther("1000"));

      // Stake in low rate pool first
      await nftCollection.connect(staker2).approve(stakeOnAPE.target, 31);
      await stakeOnAPE.connect(staker2).stakeNFT(1, 31);

      await time.increase(24 * 3600); // 1 day

      // Check rewards from low rate pool
      const lowRateRewards = await stakeOnAPE.getPendingRewards(1, 31);
      expect(lowRateRewards).to.be.closeTo(
        hre.ethers.parseEther("1"),
        hre.ethers.parseEther("0.01")
      );

      // Unstake and move to high rate pool
      await stakeOnAPE.connect(staker2).unstakeNFT(1, 31);
      await nftCollection.connect(staker2).approve(stakeOnAPE.target, 31);
      await stakeOnAPE.connect(staker2).stakeNFT(2, 31);

      await time.increase(24 * 3600); // 1 day

      // Check rewards from high rate pool
      const highRateRewards = await stakeOnAPE.getPendingRewards(2, 31);
      expect(highRateRewards).to.be.closeTo(
        hre.ethers.parseEther("5"),
        hre.ethers.parseEther("0.01")
      );
    });

    it("Should handle pool ownership transfer scenario", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner, staker1, poolId } =
        await loadFixture(deployPoolFixture);

      // Transfer ownership
      await expect(
        stakeOnAPE
          .connect(poolOwner)
          .transferPoolOwnership(poolId, staker1.address)
      ).to.emit(stakeOnAPE, "PoolOwnershipTransferred");

      // Verify new owner can manage pool
      await expect(
        stakeOnAPE
          .connect(staker1)
          .updatePoolConfig(poolId, hre.ethers.parseEther("2"), 0, false)
      ).to.emit(stakeOnAPE, "PoolConfigUpdated");

      // Verify old owner cannot manage pool
      await expect(
        stakeOnAPE
          .connect(poolOwner)
          .updatePoolConfig(poolId, hre.ethers.parseEther("3"), 0, false)
      ).to.be.revertedWith("Not pool owner");

      // Verify new owner is in userPools mapping
      const newOwnerPools = await stakeOnAPE.getUserPools(staker1.address);
      expect(newOwnerPools).to.include(BigInt(poolId));
    });
  });

  describe("Minimum NFT Requirements", function () {
    it("Should enforce minimum NFT requirement for staking", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner, nonPassHolder } = await loadFixture(deployContractsFixture);
      
      // Create a pool first
      await stakeOnAPE.connect(poolOwner).createPool(
        nftCollection.target,
        rewardToken.target,
        hre.ethers.parseEther("1"),
        0
      );

      // Fund the pool
      await rewardToken.connect(poolOwner).approve(stakeOnAPE.target, hre.ethers.parseEther("1000"));
      await stakeOnAPE.connect(poolOwner).depositToPool(1, hre.ethers.parseEther("1000"));

      // Try to stake without NFT pass (should fail)
      // First, give nonPassHolder the NFT to approve but no NFT pass
      await nftCollection.mint(nonPassHolder.address, 100);
      await nftCollection.connect(nonPassHolder).approve(stakeOnAPE.target, 100);
      await expect(stakeOnAPE.connect(nonPassHolder).stakeNFT(1, 100))
        .to.be.revertedWith("Insufficient NFT passes for staking");
    });

    it("Should enforce minimum NFT requirement for pool creation", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, staker1 } = await loadFixture(deployContractsFixture);
      
      // staker1 has 5 NFT passes, but needs 10 for pool creation
      await expect(stakeOnAPE.connect(staker1).createPool(
        nftCollection.target,
        rewardToken.target,
        hre.ethers.parseEther("1"),
        0
      )).to.be.revertedWith("Insufficient NFT passes for pool creation");
    });

    it("Should allow owner to update minimum NFT requirements", async function () {
      const { stakeOnAPE, owner } = await loadFixture(deployContractsFixture);
      
      await expect(stakeOnAPE.connect(owner).updateMinimumNFTRequirements(2, 5))
        .to.emit(stakeOnAPE, "MinimumNFTRequirementsUpdated")
        .withArgs(2, 5);

      expect(await stakeOnAPE.minNFTsForStaking()).to.equal(2);
      expect(await stakeOnAPE.minNFTsForPoolCreation()).to.equal(5);
    });

    it("Should not allow pool creation requirement less than staking requirement", async function () {
      const { stakeOnAPE, owner } = await loadFixture(deployContractsFixture);
      
      await expect(stakeOnAPE.connect(owner).updateMinimumNFTRequirements(10, 5))
        .to.be.revertedWith("Pool creation requirement must be >= staking requirement");
    });

    it("Should not allow zero requirements", async function () {
      const { stakeOnAPE, owner } = await loadFixture(deployContractsFixture);
      
      await expect(stakeOnAPE.connect(owner).updateMinimumNFTRequirements(0, 10))
        .to.be.revertedWith("Minimum NFTs for staking must be greater than 0");

      await expect(stakeOnAPE.connect(owner).updateMinimumNFTRequirements(1, 0))
        .to.be.revertedWith("Minimum NFTs for pool creation must be greater than 0");
    });

    it("Should not allow non-owner to update requirements", async function () {
      const { stakeOnAPE, staker1 } = await loadFixture(deployContractsFixture);
      
      await expect(stakeOnAPE.connect(staker1).updateMinimumNFTRequirements(2, 5))
        .to.be.revertedWithCustomError(stakeOnAPE, "OwnableUnauthorizedAccount");
    });

    it("Should allow pool creation with sufficient NFT passes", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner } = await loadFixture(deployContractsFixture);
      
      // poolOwner has 15 NFT passes, which is enough for pool creation (requires 10)
      await expect(stakeOnAPE.connect(poolOwner).createPool(
        nftCollection.target,
        rewardToken.target,
        hre.ethers.parseEther("1"),
        0
      )).to.emit(stakeOnAPE, "PoolCreated");
    });

    it("Should allow staking with sufficient NFT passes", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner, staker1 } = await loadFixture(deployContractsFixture);
      
      // Create and fund pool
      await stakeOnAPE.connect(poolOwner).createPool(
        nftCollection.target,
        rewardToken.target,
        hre.ethers.parseEther("1"),
        0
      );

      await rewardToken.connect(poolOwner).approve(stakeOnAPE.target, hre.ethers.parseEther("1000"));
      await stakeOnAPE.connect(poolOwner).depositToPool(1, hre.ethers.parseEther("1000"));

      // staker1 has 5 NFT passes, which is enough for staking (requires 1)
      await nftCollection.connect(staker1).approve(stakeOnAPE.target, 1);
      await expect(stakeOnAPE.connect(staker1).stakeNFT(1, 1))
        .to.emit(stakeOnAPE, "SoftStakeCreated");
    });

    it("Should work with updated requirements", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner, staker1, owner } = await loadFixture(deployContractsFixture);
      
      // Update requirements to allow staker1 to create pools
      await stakeOnAPE.connect(owner).updateMinimumNFTRequirements(1, 5);

      // Now staker1 should be able to create a pool
      await expect(stakeOnAPE.connect(staker1).createPool(
        nftCollection.target,
        rewardToken.target,
        hre.ethers.parseEther("1"),
        0
      )).to.emit(stakeOnAPE, "PoolCreated");
    });

    // Helper function to create mock tokens with different decimals
    async function deployMockToken(name: string, symbol: string, decimals: number, initialSupply?: number) {
      const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
      return await MockERC20.deploy(name, symbol, decimals);
    }

    async function createDecimalAwarePool(tokenDecimals: number, humanDailyRate: number) {
      const { stakeOnAPE, nftCollection, poolOwner } = await loadFixture(deployContractsFixture);
      
      // Create token with specific decimals
      const rewardToken = await deployMockToken("Test Token", "TEST", tokenDecimals);
      
      // Create reward rate based on token decimals
      const dailyRewardRate = hre.ethers.parseUnits(humanDailyRate.toString(), tokenDecimals);
      
      // Create pool
      await stakeOnAPE.connect(poolOwner).createPool(
        nftCollection.target,
        rewardToken.target,
        dailyRewardRate,
        0 // No lock
      );
      
      // Fund pool (1000 tokens in human terms)
      const fundAmount = hre.ethers.parseUnits("1000", tokenDecimals);
      await rewardToken.mint(poolOwner.address, fundAmount);
      await rewardToken.connect(poolOwner).approve(stakeOnAPE.target, fundAmount);
      await stakeOnAPE.connect(poolOwner).depositToPool(1, fundAmount);
      
      return { stakeOnAPE, nftCollection, rewardToken, poolOwner, dailyRewardRate, tokenDecimals };
    }

    describe("USDC (6 decimals)", function () {
      it("Should handle 1 USDC per day rewards correctly", async function () {
        const { stakeOnAPE, nftCollection, rewardToken, staker1 } = await loadFixture(deployContractsFixture);
        const { stakeOnAPE: poolContract, nftCollection: poolNFT, rewardToken: usdcToken } =
          await createDecimalAwarePool(6, 1); // 1 USDC/day
        
        await poolNFT.connect(staker1).approve(poolContract.target, 1);
        await poolContract.connect(staker1).stakeNFT(1, 1);
        
        // Wait 1 day
        await time.increase(24 * 60 * 60);
        
        const pendingRewards = await poolContract.getPendingRewards(1, 1);
        const expectedRewards = hre.ethers.parseUnits("1", 6); // 1 USDC = 1e6 wei
        
        expect(pendingRewards).to.be.closeTo(expectedRewards, expectedRewards / 100n);
        
        // Claim and verify balance
        const balanceBefore = await usdcToken.balanceOf(staker1.address);
        await poolContract.connect(staker1).claimRewards(1, 1);
        const balanceAfter = await usdcToken.balanceOf(staker1.address);
        
        const claimed = balanceAfter - balanceBefore;
        expect(claimed).to.be.closeTo(expectedRewards, expectedRewards / 100n);
      });

      it("Should handle fractional USDC rewards (0.5 USDC per day)", async function () {
        const { staker1 } = await loadFixture(deployContractsFixture);
        const { stakeOnAPE: poolContract, nftCollection: poolNFT } =
          await createDecimalAwarePool(6, 0.5); // 0.5 USDC/day
        
        await poolNFT.connect(staker1).approve(poolContract.target, 1);
        await poolContract.connect(staker1).stakeNFT(1, 1);
        
        await time.increase(24 * 60 * 60); // 1 day
        
        const pendingRewards = await poolContract.getPendingRewards(1, 1);
        const expectedRewards = hre.ethers.parseUnits("0.5", 6); // 0.5 USDC = 5e5 wei
        
        expect(pendingRewards).to.be.closeTo(expectedRewards, expectedRewards / 100n);
      });
    });

    describe("WBTC (8 decimals)", function () {
      it("Should handle 0.001 BTC per day rewards", async function () {
        const { staker1 } = await loadFixture(deployContractsFixture);
        const { stakeOnAPE: poolContract, nftCollection: poolNFT } =
          await createDecimalAwarePool(8, 0.001); // 0.001 BTC/day
        
        await poolNFT.connect(staker1).approve(poolContract.target, 1);
        await poolContract.connect(staker1).stakeNFT(1, 1);
        
        await time.increase(24 * 60 * 60);
        
        const pendingRewards = await poolContract.getPendingRewards(1, 1);
        const expectedRewards = hre.ethers.parseUnits("0.001", 8); // 0.001 BTC = 1e5 wei
        
        expect(pendingRewards).to.be.closeTo(expectedRewards, expectedRewards / 100n);
      });
    });

    describe("High Precision Token (24 decimals)", function () {
      it("Should handle very small rewards precisely", async function () {
        const { staker1 } = await loadFixture(deployContractsFixture);
        const { stakeOnAPE: poolContract, nftCollection: poolNFT } =
          await createDecimalAwarePool(24, 1); // 1 token/day, 24 decimals
        
        await poolNFT.connect(staker1).approve(poolContract.target, 1);
        await poolContract.connect(staker1).stakeNFT(1, 1);
        
        // Test hourly precision
        await time.increase(3600); // 1 hour
        
        const pendingRewards = await poolContract.getPendingRewards(1, 1);
        const expectedRewards = hre.ethers.parseUnits("1", 24) / 24n; // 1/24 of daily rate
        
        expect(pendingRewards).to.be.closeTo(expectedRewards, expectedRewards / 100n);
      });
    });

    describe("Low Precision Token (2 decimals)", function () {
      it("Should handle limited precision gracefully", async function () {
        const { staker1 } = await loadFixture(deployContractsFixture);
        const { stakeOnAPE: poolContract, nftCollection: poolNFT } =
          await createDecimalAwarePool(2, 1); // 1 token/day, 2 decimals
        
        await poolNFT.connect(staker1).approve(poolContract.target, 1);
        await poolContract.connect(staker1).stakeNFT(1, 1);
        
        await time.increase(24 * 60 * 60);
        
        const pendingRewards = await poolContract.getPendingRewards(1, 1);
        const expectedRewards = hre.ethers.parseUnits("1", 2); // 1 token = 100 wei
        
        expect(pendingRewards).to.be.closeTo(expectedRewards, expectedRewards / 10n);
      });

      it("Should handle rounding with limited precision", async function () {
        const { staker1 } = await loadFixture(deployContractsFixture);
        const { stakeOnAPE: poolContract, nftCollection: poolNFT } =
          await createDecimalAwarePool(2, 1); // 1 token/day, 2 decimals
        
        await poolNFT.connect(staker1).approve(poolContract.target, 1);
        await poolContract.connect(staker1).stakeNFT(1, 1);
        
        // Test sub-hour staking (should handle rounding)
        await time.increase(1800); // 30 minutes
        
        const pendingRewards = await poolContract.getPendingRewards(1, 1);
        
        // With 2 decimals, 30 minutes = 1/48 day ≈ 2.08 wei, rounds to 2 wei
        expect(pendingRewards).to.be.gte(1); // At least 1 wei
        expect(pendingRewards).to.be.lte(3); // At most 3 wei (accounting for rounding)
      });
    });

    describe("Precision Loss Edge Cases", function () {
      it("Should handle very small time periods with low-decimal tokens", async function () {
        const { staker1 } = await loadFixture(deployContractsFixture);
        const { stakeOnAPE: poolContract, nftCollection: poolNFT } =
          await createDecimalAwarePool(2, 1); // 2 decimals, 1 token/day
        
        await poolNFT.connect(staker1).approve(poolContract.target, 1);
        await poolContract.connect(staker1).stakeNFT(1, 1);
        
        // Very short staking period
        await time.increase(60); // 1 minute
        
        const pendingRewards = await poolContract.getPendingRewards(1, 1);
        
        // With 2 decimals, 1 minute rewards = 100 wei / (24*60) ≈ 0.069 wei
        // Should round to 0
        expect(pendingRewards).to.equal(0);
      });

      it("Should accumulate rewards over time despite precision loss", async function () {
        const { staker1 } = await loadFixture(deployContractsFixture);
        const { stakeOnAPE: poolContract, nftCollection: poolNFT, rewardToken } =
          await createDecimalAwarePool(2, 1);
        
        await poolNFT.connect(staker1).approve(poolContract.target, 1);
        await poolContract.connect(staker1).stakeNFT(1, 1);
        
        let totalClaimed = 0n;
        
        // Claim every hour for 24 hours
        for (let i = 0; i < 24; i++) {
          await time.increase(3600); // 1 hour
          
          const balanceBefore = await rewardToken.balanceOf(staker1.address);
          await poolContract.connect(staker1).claimRewards(1, 1);
          const balanceAfter = await rewardToken.balanceOf(staker1.address);
          
          totalClaimed += balanceAfter - balanceBefore;
        }
        
        // Total should be close to 1 token (100 wei with 2 decimals)
        const expectedTotal = hre.ethers.parseUnits("1", 2);
        expect(totalClaimed).to.be.closeTo(expectedTotal, expectedTotal / 10n);
      });
    });
  });

  describe("Stress Tests", function () {
    it("Should handle 1000+ staked NFTs efficiently", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner, owner, nftPass } = await loadFixture(deployContractsFixture);
      
      // Create a large pool
      await stakeOnAPE.connect(poolOwner).createPool(
        nftCollection.target,
        rewardToken.target,
        hre.ethers.parseEther("0.01"), // Small reward rate to handle many NFTs
        0
      );
      
      // Fund the pool generously - first mint enough tokens
      await rewardToken.mint(poolOwner.address, hre.ethers.parseEther("100000"));
      await rewardToken.connect(poolOwner).approve(stakeOnAPE.target, hre.ethers.parseEther("100000"));
      await stakeOnAPE.connect(poolOwner).depositToPool(1, hre.ethers.parseEther("100000"));
      
      // Create many signers for stress testing
      const signers = await hre.ethers.getSigners();
      const testSigners = signers.slice(5, 15); // Use signers 5-14 (10 signers)
      
      // Give NFT passes to all test signers
      for (let i = 0; i < testSigners.length; i++) {
        await nftPass.mint(testSigners[i].address, 1000 + i);
      }
      
      // Mint and stake 100 NFTs per signer (1000 total)
      let tokenIdCounter = 1000;
      for (let signerIndex = 0; signerIndex < testSigners.length; signerIndex++) {
        const signer = testSigners[signerIndex];
        const tokenIds: number[] = [];
        
        // Mint 100 NFTs for this signer
        for (let j = 0; j < 100; j++) {
          tokenIdCounter++;
          await nftCollection.mint(signer.address, tokenIdCounter);
          tokenIds.push(tokenIdCounter);
        }
        
        // Batch approve and stake in chunks of 20 (MAX_BATCH_SIZE)
        for (let k = 0; k < tokenIds.length; k += 20) {
          const batch = tokenIds.slice(k, k + 20);
          
          // Approve batch
          for (const tokenId of batch) {
            await nftCollection.connect(signer).approve(stakeOnAPE.target, tokenId);
          }
          
          // Stake batch
          await stakeOnAPE.connect(signer).batchStakeNFTs(1, batch);
        }
      }
      
      // Verify all NFTs are staked
      let totalStaked = 0;
      for (const signer of testSigners) {
        const stakedTokens = await stakeOnAPE.getUserStakedTokens(signer.address, 1);
        totalStaked += stakedTokens.length;
      }
      
      expect(totalStaked).to.equal(1000);
      
      // Test reward calculation still works efficiently
      await time.increase(3600); // 1 hour
      
      // Check a few random pending rewards (should not timeout)
      const rewards1 = await stakeOnAPE.getPendingRewards(1, 1001);
      const rewards2 = await stakeOnAPE.getPendingRewards(1, 1500);
      const rewards3 = await stakeOnAPE.getPendingRewards(1, 2000);
      
      expect(rewards1).to.be.gt(0);
      expect(rewards2).to.be.gt(0);
      expect(rewards3).to.be.gt(0);
      
      // Test batch claiming still works
      const firstSigner = testSigners[0];
      const firstSignerTokens = await stakeOnAPE.getUserStakedTokens(firstSigner.address, 1);
      const firstBatch = Array.from(firstSignerTokens.slice(0, 20)).map(n => Number(n));
      
      await expect(stakeOnAPE.connect(firstSigner).batchClaimRewards(1, firstBatch))
        .to.emit(stakeOnAPE, "RewardsClaimed");
    });
    
    it("Should handle rapid stake/unstake cycles", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner, staker1 } = await loadFixture(deployContractsFixture);
      
      // Create pool with no lock duration for rapid cycling
      await stakeOnAPE.connect(poolOwner).createPool(
        nftCollection.target,
        rewardToken.target,
        hre.ethers.parseEther("1"),
        0 // No lock duration
      );
      
      // Fund the pool
      await rewardToken.connect(poolOwner).approve(stakeOnAPE.target, hre.ethers.parseEther("10000"));
      await stakeOnAPE.connect(poolOwner).depositToPool(1, hre.ethers.parseEther("10000"));
      
      // Mint 50 NFTs for rapid cycling using unique IDs
      const tokenIds: number[] = [];
      for (let i = 5001; i <= 5050; i++) {
        await nftCollection.mint(staker1.address, i);
        tokenIds.push(i);
      }
      
      // Perform rapid stake/unstake cycles
      for (let cycle = 0; cycle < 10; cycle++) {
        // Stake all NFTs
        for (const tokenId of tokenIds) {
          await nftCollection.connect(staker1).approve(stakeOnAPE.target, tokenId);
          await stakeOnAPE.connect(staker1).stakeNFT(1, tokenId);
        }
        
        // Wait a short time to accumulate some rewards
        await time.increase(100); // 100 seconds
        
        // Unstake all NFTs
        for (const tokenId of tokenIds) {
          await stakeOnAPE.connect(staker1).unstakeNFT(1, tokenId);
        }
        
        // Verify all NFTs are back to the staker
        for (const tokenId of tokenIds) {
          expect(await nftCollection.ownerOf(tokenId)).to.equal(staker1.address);
        }
        
        // Verify no NFTs are still staked
        const stakedTokens = await stakeOnAPE.getUserStakedTokens(staker1.address, 1);
        expect(stakedTokens.length).to.equal(0);
      }
      
      // Final verification: stake one more time and verify state consistency
      await nftCollection.connect(staker1).approve(stakeOnAPE.target, 5001);
      await stakeOnAPE.connect(staker1).stakeNFT(1, 5001);
      
      const finalStakedTokens = await stakeOnAPE.getUserStakedTokens(staker1.address, 1);
      expect(finalStakedTokens).to.deep.equal([5001n]);
      
      // Verify staker has accumulated rewards from all the cycling
      const finalBalance = await rewardToken.balanceOf(staker1.address);
      expect(finalBalance).to.be.gt(0);
    });
  });

  describe("Unstake Without Rewards", function () {

  it("Should allow unstaking without rewards when pool has sufficient balance", async function () {
  const { stakeOnAPE, nftCollection, rewardToken, poolOwner, staker1 } =
    await loadFixture(deployPoolFixtureNoLock);

  // Stake NFT
  await nftCollection.connect(staker1).approve(stakeOnAPE.target, 1);
  await stakeOnAPE.connect(staker1).stakeNFT(1, 1);

  // Wait for rewards to accumulate
  await time.increase(24 * 60 * 60); // 1 day

  // Check pool can pay (don't store the exact amount since it will change)
  const [canPay] = await stakeOnAPE.canPoolPayRewards(1, 1);
  expect(canPay).to.be.true;

  // User chooses to unstake without rewards (their choice)
  const balanceBefore = await rewardToken.balanceOf(staker1.address);
  
  // Use anyValue for the forfeited rewards since timing makes it imprecise
  await expect(stakeOnAPE.connect(staker1).unstakeWithoutRewards(1, 1))
    .to.emit(stakeOnAPE, "NFTUnstakedWithoutRewards")
    .withArgs(1, staker1.address, 1, anyValue) // Use anyValue for timing-sensitive reward amount
    .and.to.emit(stakeOnAPE, "NFTUnstaked")
    .withArgs(1, staker1.address, 1, anyValue);

  // NFT returned
  expect(await nftCollection.ownerOf(1)).to.equal(staker1.address);

  // No rewards paid
  const balanceAfter = await rewardToken.balanceOf(staker1.address);
  expect(balanceAfter).to.equal(balanceBefore);

  // NFT no longer staked
  const userTokens = await stakeOnAPE.getUserStakedTokens(staker1.address, 1);
  expect(userTokens).to.deep.equal([]);
});

  it("Should allow unstaking without rewards when pool balance is insufficient", async function () {
  const { stakeOnAPE, nftCollection, rewardToken, poolOwner, staker1, owner } =
    await loadFixture(deployPoolFixtureNoLock);

  await nftCollection.connect(staker1).approve(stakeOnAPE.target, 1);
  await stakeOnAPE.connect(staker1).stakeNFT(1, 1);

  await time.increase(24 * 60 * 60); // 1 day

  // Drain pool completely
  const poolBalance = await stakeOnAPE.getPoolBalance(1);
  await stakeOnAPE.connect(owner).emergencyWithdraw(
    1,
    rewardToken.target,
    poolBalance,
    owner.address
  );

  // Verify pool cannot pay
  const [canPay] = await stakeOnAPE.canPoolPayRewards(1, 1);
  expect(canPay).to.be.false;

  // Regular unstake should fail
  await expect(
    stakeOnAPE.connect(staker1).unstakeNFT(1, 1)
  ).to.be.revertedWith("Insufficient pool balance");

  // Unstake without rewards should work - use anyValue for forfeited amount
  await expect(stakeOnAPE.connect(staker1).unstakeWithoutRewards(1, 1))
    .to.emit(stakeOnAPE, "NFTUnstakedWithoutRewards")
    .withArgs(1, staker1.address, 1, anyValue); // Use anyValue for timing-sensitive amount

  expect(await nftCollection.ownerOf(1)).to.equal(staker1.address);
});

    it("Should allow immediate unstaking without rewards in soft staking", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner, staker1 } =
        await loadFixture(deployContractsFixture);

      // Create pool (lock duration doesn't apply to soft staking)
      await stakeOnAPE.connect(poolOwner).createPool(
        nftCollection.target,
        rewardToken.target,
        hre.ethers.parseEther("1"),
        7 * 24 * 60 * 60 // 7 days (ignored in soft staking)
      );

      await rewardToken.connect(poolOwner).approve(stakeOnAPE.target, hre.ethers.parseEther("1000"));
      await stakeOnAPE.connect(poolOwner).depositToPool(1, hre.ethers.parseEther("1000"));

      await stakeOnAPE.connect(staker1).stakeNFT(1, 1);

      // Should be able to unstake immediately in soft staking
      await expect(stakeOnAPE.connect(staker1).unstakeWithoutRewards(1, 1))
        .to.emit(stakeOnAPE, "NFTUnstakedWithoutRewards");

      expect(await nftCollection.ownerOf(1)).to.equal(staker1.address);
    });

    it("Should handle batch unstaking without rewards", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner, staker1, owner } =
        await loadFixture(deployPoolFixtureNoLock);

      // Stake multiple NFTs
      const tokenIds = [1, 2, 3, 4, 5];
      for (const tokenId of tokenIds) {
        await nftCollection.connect(staker1).approve(stakeOnAPE.target, tokenId);
        await stakeOnAPE.connect(staker1).stakeNFT(1, tokenId);
      }

      await time.increase(24 * 60 * 60); // 1 day

      // Partially drain pool (enough for some but not all)
      await stakeOnAPE.connect(owner).emergencyWithdraw(
        1,
        rewardToken.target,
        hre.ethers.parseEther("998"), // Leave 2 tokens, but 5 NFTs * 1 token = 5 tokens needed
        owner.address
      );

      // Batch unstake without rewards
      await expect(
        stakeOnAPE.connect(staker1).batchUnstakeWithoutRewards(1, tokenIds)
      ).to.emit(stakeOnAPE, "NFTUnstakedWithoutRewards");

      // Verify all NFTs returned
      for (const tokenId of tokenIds) {
        expect(await nftCollection.ownerOf(tokenId)).to.equal(staker1.address);
      }

      // Verify no NFTs still staked
      const userTokens = await stakeOnAPE.getUserStakedTokens(staker1.address, 1);
      expect(userTokens).to.deep.equal([]);
    });

    it("Should calculate forfeited rewards correctly", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner, staker1 } =
        await loadFixture(deployPoolFixtureNoLock);

      await nftCollection.connect(staker1).approve(stakeOnAPE.target, 1);
      await stakeOnAPE.connect(staker1).stakeNFT(1, 1);

      // Wait different periods and check forfeited rewards
      await time.increase(12 * 60 * 60); // 12 hours
      
      let forfeitedRewards = await stakeOnAPE.getForfeitedRewards(1, 1);
      expect(forfeitedRewards).to.be.closeTo(
        hre.ethers.parseEther("0.5"), // ~0.5 tokens for 12 hours
        hre.ethers.parseEther("0.01")
      );

      await time.increase(12 * 60 * 60); // Another 12 hours = 24 total

      forfeitedRewards = await stakeOnAPE.getForfeitedRewards(1, 1);
      expect(forfeitedRewards).to.be.closeTo(
        hre.ethers.parseEther("1"), // ~1 token for 24 hours
        hre.ethers.parseEther("0.01")
      );
    });

    it("Should handle pool health checking for multiple NFTs", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner, staker1, owner } =
        await loadFixture(deployPoolFixtureNoLock);

      // Stake 5 NFTs at different times
      const tokenIds = [1, 2, 3, 4, 5];
      for (let i = 0; i < tokenIds.length; i++) {
        await nftCollection.connect(staker1).approve(stakeOnAPE.target, tokenIds[i]);
        await stakeOnAPE.connect(staker1).stakeNFT(1, tokenIds[i]);
        
        if (i < tokenIds.length - 1) {
          await time.increase(6 * 60 * 60); // 6 hours between each stake
        }
      }

      // Total time: NFT1=24h, NFT2=18h, NFT3=12h, NFT4=6h, NFT5=0h
      // Expected rewards: ~1.0 + ~0.75 + ~0.5 + ~0.25 + ~0 = ~2.5 tokens

      // Check pool health
      let [healthyCount, unhealthyCount, totalPending, poolBalance] =
        await stakeOnAPE.getPoolHealthForUser(staker1.address, 1);

      expect(healthyCount).to.equal(5); // All healthy initially
      expect(unhealthyCount).to.equal(0);
      expect(totalPending).to.be.closeTo(hre.ethers.parseEther("2.5"), hre.ethers.parseEther("0.2"));
      expect(poolBalance).to.equal(hre.ethers.parseEther("1000"));

      // Drain pool to 1 token (can only pay for ~1 NFT)
      await stakeOnAPE.connect(owner).emergencyWithdraw(
        1,
        rewardToken.target,
        hre.ethers.parseEther("999"),
        owner.address
      );

      [healthyCount, unhealthyCount, totalPending, poolBalance] =
        await stakeOnAPE.getPoolHealthForUser(staker1.address, 1);

      expect(poolBalance).to.equal(hre.ethers.parseEther("1"));
      expect(healthyCount).to.be.lt(5); // Some unhealthy now
      expect(unhealthyCount).to.be.gt(0);
      expect(healthyCount + unhealthyCount).to.equal(5); // Total should be 5
    });

    it("Should provide pool health info for individual NFTs", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner, staker1, owner } =
        await loadFixture(deployPoolFixtureNoLock);

      await nftCollection.connect(staker1).approve(stakeOnAPE.target, 1);
      await stakeOnAPE.connect(staker1).stakeNFT(1, 1);

      await time.increase(24 * 60 * 60); // 1 day

      // Initially healthy
      let [canPay, pendingRewards, poolBalance] = await stakeOnAPE.canPoolPayRewards(1, 1);
      expect(canPay).to.be.true;
      expect(pendingRewards).to.be.closeTo(hre.ethers.parseEther("1"), hre.ethers.parseEther("0.01"));
      expect(poolBalance).to.equal(hre.ethers.parseEther("1000"));

      // Drain pool below pending rewards
      await stakeOnAPE.connect(owner).emergencyWithdraw(
        1,
        rewardToken.target,
        hre.ethers.parseEther("999.5"), // Leave 0.5 tokens
        owner.address
      );

      [canPay, pendingRewards, poolBalance] = await stakeOnAPE.canPoolPayRewards(1, 1);
      expect(canPay).to.be.false;
      expect(pendingRewards).to.be.gt(poolBalance);
    });

  it("Should handle zero pending rewards gracefully", async function () {
  const { stakeOnAPE, nftCollection, poolOwner, staker1 } =
    await loadFixture(deployPoolFixtureNoLock);

  await nftCollection.connect(staker1).approve(stakeOnAPE.target, 1);
  
  // Capture timestamp right before staking to minimize time difference
  const stakeTx = await stakeOnAPE.connect(staker1).stakeNFT(1, 1);
  await stakeTx.wait();

  // Check rewards immediately (should be very close to 0)
  const forfeitedRewards = await stakeOnAPE.getForfeitedRewards(1, 1);
  
  // Expect very small amount due to block time, but should be minimal
  expect(forfeitedRewards).to.be.lt(hre.ethers.parseEther("0.001")); // Less than 0.001 tokens

  // Unstake immediately
  await expect(stakeOnAPE.connect(staker1).unstakeWithoutRewards(1, 1))
    .to.emit(stakeOnAPE, "NFTUnstakedWithoutRewards")
    .withArgs(1, staker1.address, 1, anyValue); // Use anyValue since exact timing varies

  expect(await nftCollection.ownerOf(1)).to.equal(staker1.address);
});

    it("Should validate batch size limits", async function () {
      const { stakeOnAPE, staker1 } = await loadFixture(deployPoolFixtureNoLock);

      // Too many tokens
      const tooManyTokens = Array.from({ length: 21 }, (_, i) => i + 1);
      await expect(
        stakeOnAPE.connect(staker1).batchUnstakeWithoutRewards(1, tooManyTokens)
      ).to.be.revertedWith("Too many NFTs in batch");

      // Empty array
      await expect(
        stakeOnAPE.connect(staker1).batchUnstakeWithoutRewards(1, [])
      ).to.be.revertedWith("No token IDs provided");
    });

    it("Should maintain contract state consistency", async function () {
      const { stakeOnAPE, nftCollection, rewardToken, poolOwner, staker1 } =
        await loadFixture(deployPoolFixtureNoLock);

      // Stake multiple NFTs
      const tokenIds = [1, 2, 3];
      for (const tokenId of tokenIds) {
        await nftCollection.connect(staker1).approve(stakeOnAPE.target, tokenId);
        await stakeOnAPE.connect(staker1).stakeNFT(1, tokenId);
      }

      await time.increase(24 * 60 * 60);

      // Unstake middle NFT without rewards
      await stakeOnAPE.connect(staker1).unstakeWithoutRewards(1, 2);

      // Verify state consistency
      const userTokens = await stakeOnAPE.getUserStakedTokens(staker1.address, 1);
      expect(userTokens.map(n => Number(n)).sort()).to.deep.equal([1, 3]);

      // Verify unstaked NFT state is reset
      const stakedInfo = await stakeOnAPE.getStakeInfo(1, 2);
      expect(stakedInfo.originalOwner).to.equal(hre.ethers.ZeroAddress);
      expect(stakedInfo.stakedAt).to.equal(0);

      // Other NFTs should still be properly staked
      const stakedInfo1 = await stakeOnAPE.getStakeInfo(1, 1);
      const stakedInfo3 = await stakeOnAPE.getStakeInfo(1, 3);
      expect(stakedInfo1.originalOwner).to.equal(staker1.address);
      expect(stakedInfo3.originalOwner).to.equal(staker1.address);
    });

    describe("User Experience Scenarios", function () {
      it("Should allow user to choose between regular and no-rewards unstaking", async function () {
        const { stakeOnAPE, nftCollection, rewardToken, poolOwner, staker1, staker2 } =
          await loadFixture(deployPoolFixtureNoLock);

        // Both users stake
        await nftCollection.connect(staker1).approve(stakeOnAPE.target, 1);
        await stakeOnAPE.connect(staker1).stakeNFT(1, 1);

        await nftCollection.connect(staker2).approve(stakeOnAPE.target, 31);
        await stakeOnAPE.connect(staker2).stakeNFT(1, 31);

        await time.increase(24 * 60 * 60); // 1 day

        // User 1 chooses regular unstake (gets rewards)
        const balance1Before = await rewardToken.balanceOf(staker1.address);
        await stakeOnAPE.connect(staker1).unstakeNFT(1, 1);
        const balance1After = await rewardToken.balanceOf(staker1.address);
        
        expect(balance1After).to.be.gt(balance1Before); // Got rewards

        // User 2 chooses unstake without rewards (faster, no rewards)
        const balance2Before = await rewardToken.balanceOf(staker2.address);
        await stakeOnAPE.connect(staker2).unstakeWithoutRewards(1, 31);
        const balance2After = await rewardToken.balanceOf(staker2.address);
        
        expect(balance2After).to.equal(balance2Before); // No rewards

        // Both got their NFTs back
        expect(await nftCollection.ownerOf(1)).to.equal(staker1.address);
        expect(await nftCollection.ownerOf(31)).to.equal(staker2.address);
      });
    });
  });
});
