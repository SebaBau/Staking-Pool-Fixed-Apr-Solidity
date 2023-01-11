import { Contract, ContractFactory, Signer } from "ethers";

import { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { getBigNumber, duration, ADDRESS_ZERO, latest, increase } from "./utilities";

import ExampleContractArtifact from "../artifacts/contracts/ExampleContract.sol/ExampleContract.json";

import { ExampleContract } from "../typechain";
import { Wallet, BigNumber } from "ethers";

const { provider, deployContract } = waffle;

describe("Test Set Name", () => {
  const [deployer, alice, bob] = provider.getWallets() as Wallet[];
  let exampleContract: ExampleContract;

  beforeEach(async () => {
    exampleContract = (await deployContract(deployer, ExampleContractArtifact, [])) as ExampleContract;
  });

  it("Test Name", async () => {});
});
