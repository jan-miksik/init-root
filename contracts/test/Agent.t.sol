// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {Agent} from "../src/Agent.sol";

contract AgentTest is Test {
    Agent public agentContract;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        agentContract = new Agent();
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    // ─── createAgent ────────────────────────────────────────────────────────────

    function test_createAgent_succeeds() public {
        bytes memory meta = bytes('{"strategy":"momentum","pair":"INIT/USD"}');
        vm.prank(alice);
        agentContract.createAgent(meta);

        (bytes memory m, uint256 bal, bool exists, bool autoSign) = agentContract.getAgent(alice);
        assertEq(m, meta);
        assertEq(bal, 0);
        assertTrue(exists);
        assertFalse(autoSign);
    }

    function test_createAgent_emitsEvent() public {
        bytes memory meta = bytes("test");
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit Agent.AgentCreated(alice, meta, block.timestamp);
        agentContract.createAgent(meta);
    }

    function test_createAgent_revertsIfAlreadyExists() public {
        vm.startPrank(alice);
        agentContract.createAgent(bytes("first"));
        vm.expectRevert(Agent.AgentAlreadyExists.selector);
        agentContract.createAgent(bytes("second"));
        vm.stopPrank();
    }

    // ─── deposit ────────────────────────────────────────────────────────────────

    function test_deposit_succeeds() public {
        vm.prank(alice);
        agentContract.createAgent(bytes("meta"));
        vm.prank(alice);
        agentContract.deposit{value: 1 ether}();

        (, uint256 bal,,) = agentContract.getAgent(alice);
        assertEq(bal, 1 ether);
    }

    function test_deposit_emitsEvent() public {
        vm.prank(alice);
        agentContract.createAgent(bytes("meta"));
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit Agent.Deposited(alice, 1 ether, 1 ether);
        agentContract.deposit{value: 1 ether}();
    }

    function test_deposit_revertsNoAgent() public {
        vm.prank(alice);
        vm.expectRevert(Agent.AgentNotFound.selector);
        agentContract.deposit{value: 1 ether}();
    }

    function test_deposit_revertsZeroValue() public {
        vm.prank(alice);
        agentContract.createAgent(bytes("meta"));
        vm.prank(alice);
        vm.expectRevert(Agent.ZeroDeposit.selector);
        agentContract.deposit{value: 0}();
    }

    function test_deposit_accumulates() public {
        vm.prank(alice);
        agentContract.createAgent(bytes("meta"));
        vm.prank(alice);
        agentContract.deposit{value: 1 ether}();
        vm.prank(alice);
        agentContract.deposit{value: 2 ether}();

        (, uint256 bal,,) = agentContract.getAgent(alice);
        assertEq(bal, 3 ether);
    }

    // ─── withdraw ───────────────────────────────────────────────────────────────

    function test_withdraw_succeeds() public {
        vm.prank(alice);
        agentContract.createAgent(bytes("meta"));
        vm.prank(alice);
        agentContract.deposit{value: 5 ether}();

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        agentContract.withdraw(3 ether);

        (, uint256 bal,,) = agentContract.getAgent(alice);
        assertEq(bal, 2 ether);
        assertEq(alice.balance, aliceBefore + 3 ether);
    }

    function test_withdraw_emitsEvent() public {
        vm.prank(alice);
        agentContract.createAgent(bytes("meta"));
        vm.prank(alice);
        agentContract.deposit{value: 5 ether}();
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit Agent.Withdrawn(alice, 3 ether, 2 ether);
        agentContract.withdraw(3 ether);
    }

    function test_withdraw_revertsNoAgent() public {
        vm.prank(alice);
        vm.expectRevert(Agent.AgentNotFound.selector);
        agentContract.withdraw(1 ether);
    }

    function test_withdraw_revertsInsufficientBalance() public {
        vm.prank(alice);
        agentContract.createAgent(bytes("meta"));
        vm.prank(alice);
        agentContract.deposit{value: 1 ether}();
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(Agent.InsufficientBalance.selector, 2 ether, 1 ether)
        );
        agentContract.withdraw(2 ether);
    }

    // ─── executeTick ────────────────────────────────────────────────────────────

    function test_executeTick_emitsEvent() public {
        vm.prank(alice);
        agentContract.createAgent(bytes("meta"));
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit Agent.TickExecuted(alice, block.timestamp);
        agentContract.executeTick();
    }

    function test_executeTick_revertsNoAgent() public {
        vm.prank(alice);
        vm.expectRevert(Agent.AgentNotFound.selector);
        agentContract.executeTick();
    }

    // ─── autoSign ───────────────────────────────────────────────────────────────

    function test_enableAutoSign() public {
        vm.prank(alice);
        agentContract.createAgent(bytes("meta"));
        vm.prank(alice);
        agentContract.enableAutoSign();

        (,,, bool autoSign) = agentContract.getAgent(alice);
        assertTrue(autoSign);
    }

    function test_disableAutoSign() public {
        vm.prank(alice);
        agentContract.createAgent(bytes("meta"));
        vm.prank(alice);
        agentContract.enableAutoSign();
        vm.prank(alice);
        agentContract.disableAutoSign();

        (,,, bool autoSign) = agentContract.getAgent(alice);
        assertFalse(autoSign);
    }

    function test_autoSign_emitsEvents() public {
        vm.prank(alice);
        agentContract.createAgent(bytes("meta"));

        vm.prank(alice);
        vm.expectEmit(true, false, false, false);
        emit Agent.AutoSignEnabled(alice);
        agentContract.enableAutoSign();

        vm.prank(alice);
        vm.expectEmit(true, false, false, false);
        emit Agent.AutoSignDisabled(alice);
        agentContract.disableAutoSign();
    }

    // ─── updateMetadata ─────────────────────────────────────────────────────────

    function test_updateMetadata_succeeds() public {
        vm.prank(alice);
        agentContract.createAgent(bytes("old"));
        vm.prank(alice);
        agentContract.updateMetadata(bytes("new"));

        (bytes memory m,,,) = agentContract.getAgent(alice);
        assertEq(m, bytes("new"));
    }

    // ─── hasAgent ───────────────────────────────────────────────────────────────

    function test_hasAgent() public {
        assertFalse(agentContract.hasAgent(alice));
        vm.prank(alice);
        agentContract.createAgent(bytes("meta"));
        assertTrue(agentContract.hasAgent(alice));
    }

    // ─── isolation between users ────────────────────────────────────────────────

    function test_agentsAreIsolated() public {
        vm.prank(alice);
        agentContract.createAgent(bytes("alice-meta"));
        vm.prank(alice);
        agentContract.deposit{value: 5 ether}();

        vm.prank(bob);
        agentContract.createAgent(bytes("bob-meta"));

        (, uint256 aliceBal,,) = agentContract.getAgent(alice);
        (, uint256 bobBal,,) = agentContract.getAgent(bob);
        assertEq(aliceBal, 5 ether);
        assertEq(bobBal, 0);
    }

    // ─── fuzz ───────────────────────────────────────────────────────────────────

    function testFuzz_depositAndWithdraw(uint96 amount) public {
        vm.assume(amount > 0 && amount <= 50 ether);
        vm.prank(alice);
        agentContract.createAgent(bytes("meta"));
        vm.prank(alice);
        agentContract.deposit{value: amount}();
        (, uint256 bal,,) = agentContract.getAgent(alice);
        assertEq(bal, amount);

        vm.prank(alice);
        agentContract.withdraw(amount);
        (, uint256 bal2,,) = agentContract.getAgent(alice);
        assertEq(bal2, 0);
    }
}
