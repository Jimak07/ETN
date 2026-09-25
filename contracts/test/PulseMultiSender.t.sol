// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import { PulseMultiSender } from "../src/PulseMultiSender.sol";

/// Minimal ERC-20 so the suite does not depend on OpenZeppelin's test mocks.
contract MockERC20 is ERC20 {
    constructor() ERC20("Mock", "MOCK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract PulseMultiSenderTest is Test {
    PulseMultiSender internal sender;
    MockERC20 internal token;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    receive() external payable {}

    function setUp() public {
        sender = new PulseMultiSender();
        token = new MockERC20();
        vm.deal(address(this), 100 ether);
        token.mint(address(this), 1_000e18);
        token.approve(address(sender), type(uint256).max);
    }

    function _list() internal view returns (address[] memory recipients, uint256[] memory amounts) {
        recipients = new address[](2);
        amounts = new uint256[](2);
        recipients[0] = alice;
        recipients[1] = bob;
        amounts[0] = 1 ether;
        amounts[1] = 2 ether;
    }

    function testBatchSendNativePaysEveryone() public {
        (address[] memory recipients, uint256[] memory amounts) = _list();

        sender.batchSendNative{ value: 3 ether }(recipients, amounts);

        assertEq(alice.balance, 1 ether);
        assertEq(bob.balance, 2 ether);
        assertEq(address(sender).balance, 0);
    }

    function testBatchSendNativeRevertsOnLengthMismatch() public {
        (address[] memory recipients, ) = _list();
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1 ether;

        vm.expectRevert("length mismatch");
        sender.batchSendNative{ value: 1 ether }(recipients, amounts);
    }

    function testBatchSendNativeRevertsOnInsufficientValue() public {
        (address[] memory recipients, uint256[] memory amounts) = _list();

        vm.expectRevert("insufficient msg.value");
        sender.batchSendNative{ value: 2 ether }(recipients, amounts);
    }

    function testBatchSendNativeRefundsExcessValue() public {
        (address[] memory recipients, uint256[] memory amounts) = _list();
        uint256 startBalance = address(this).balance;

        // Total required is 3 ether; send 5 ether (excess 2 ether)
        sender.batchSendNative{ value: 5 ether }(recipients, amounts);

        assertEq(alice.balance, 1 ether);
        assertEq(bob.balance, 2 ether);
        assertEq(address(sender).balance, 0);
        // Excess 2 ether was refunded back to this contract
        assertEq(address(this).balance, startBalance - 3 ether);
    }

    function testBatchSendNativeRevertsOnZeroRecipient() public {
        address[] memory recipients = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1 ether;

        vm.expectRevert("zero recipient");
        sender.batchSendNative{ value: 1 ether }(recipients, amounts);
    }

    function testBatchSendNativeRevertsOnEmptyBatch() public {
        address[] memory recipients = new address[](0);
        uint256[] memory amounts = new uint256[](0);

        vm.expectRevert("empty batch");
        sender.batchSendNative{ value: 0 }(recipients, amounts);
    }

    function testBatchSendNativeRejectsOversizedBatch() public {
        uint256 count = sender.MAX_BATCH_SIZE() + 1;
        address[] memory recipients = new address[](count);
        uint256[] memory amounts = new uint256[](count);
        for (uint256 i; i < count; ++i) {
            recipients[i] = address(uint160(i + 1));
            amounts[i] = 1;
        }

        vm.expectRevert("batch too large");
        sender.batchSendNative{ value: count }(recipients, amounts);
    }

    function testBatchSendERC20PaysEveryone() public {
        (address[] memory recipients, uint256[] memory amounts) = _list();

        sender.batchSendERC20(address(token), recipients, amounts);

        assertEq(token.balanceOf(alice), 1 ether);
        assertEq(token.balanceOf(bob), 2 ether);
        assertEq(token.balanceOf(address(sender)), 0);
    }

    function testBatchSendERC20RevertsWithoutAllowance() public {
        (address[] memory recipients, uint256[] memory amounts) = _list();
        token.approve(address(sender), 0);

        vm.expectRevert();
        sender.batchSendERC20(address(token), recipients, amounts);
    }

    function testBatchSendERC20RejectsNativeValue() public {
        (address[] memory recipients, uint256[] memory amounts) = _list();

        // Declared payable so the contract can give a reason; the value itself
        // is still refused.
        vm.expectRevert("no native value");
        sender.batchSendERC20{ value: 1 wei }(address(token), recipients, amounts);
    }

    function testBatchSendERC20RevertsOnZeroAmount() public {
        address[] memory recipients = new address[](1);
        recipients[0] = alice;
        uint256[] memory amounts = new uint256[](1);

        vm.expectRevert("zero amount");
        sender.batchSendERC20(address(token), recipients, amounts);
    }
}
