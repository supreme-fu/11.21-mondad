import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('CompletionReceipt', function () {
  async function deploy() {
    const [submitter, other] = await ethers.getSigners();
    const Receipt = await ethers.getContractFactory('CompletionReceipt');
    const receipt = await Receipt.deploy(submitter.address);
    return { receipt, submitter, other };
  }

  it('只允许受限提交者登记随机编号', async function () {
    const { receipt, submitter } = await deploy();
    const id = ethers.randomBytes(32);
    await expect(receipt.registerReceipt(id))
      .to.emit(receipt, 'ReceiptRegistered')
      .withArgs(ethers.hexlify(id));
    expect(await receipt.exists(id)).to.equal(true);
    expect(await receipt.submitter()).to.equal(submitter.address);
  });

  it('拒绝非授权调用、零值和重复编号', async function () {
    const { receipt, other } = await deploy();
    const id = ethers.randomBytes(32);
    await expect(receipt.connect(other).registerReceipt(id)).to.be.revertedWithCustomError(
      receipt,
      'NotSubmitter',
    );
    await expect(receipt.registerReceipt(ethers.ZeroHash)).to.be.revertedWithCustomError(
      receipt,
      'ZeroReceipt',
    );
    await receipt.registerReceipt(id);
    await expect(receipt.registerReceipt(id)).to.be.revertedWithCustomError(
      receipt,
      'ReceiptAlreadyRegistered',
    );
  });

  it('事件不携带正文、用户或活动字段', async function () {
    const { receipt } = await deploy();
    const id = ethers.randomBytes(32);
    const tx = await receipt.registerReceipt(id);
    const result = await tx.wait();
    const event = result?.logs[0];
    expect(event?.topics).to.have.length(2);
    expect(event?.data).to.equal('0x');
  });
});
