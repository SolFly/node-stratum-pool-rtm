var util = require('./util.js');


/*
function Transaction(params){

    var version = params.version || 1,
        inputs = params.inputs || [],
        outputs = params.outputs || [],
        lockTime = params.lockTime || 0;


    this.toBuffer = function(){
        return Buffer.concat([
            binpack.packUInt32(version, 'little'),
            util.varIntBuffer(inputs.length),
            Buffer.concat(inputs.map(function(i){ return i.toBuffer() })),
            util.varIntBuffer(outputs.length),
            Buffer.concat(outputs.map(function(o){ return o.toBuffer() })),
            binpack.packUInt32(lockTime, 'little')
        ]);
    };

    this.inputs = inputs;
    this.outputs = outputs;

}

function TransactionInput(params){

    var prevOutHash = params.prevOutHash || 0,
        prevOutIndex = params.prevOutIndex,
        sigScript = params.sigScript,
        sequence = params.sequence || 0;


    this.toBuffer = function(){
        sigScriptBuffer = sigScript.toBuffer();
        console.log('scriptSig length ' + sigScriptBuffer.length);
        return Buffer.concat([
            util.uint256BufferFromHash(prevOutHash),
            binpack.packUInt32(prevOutIndex, 'little'),
            util.varIntBuffer(sigScriptBuffer.length),
            sigScriptBuffer,
            binpack.packUInt32(sequence)
        ]);
    };
}

function TransactionOutput(params){

    var value = params.value,
        pkScriptBuffer = params.pkScriptBuffer;

    this.toBuffer = function(){
        return Buffer.concat([
            binpack.packInt64(value, 'little'),
            util.varIntBuffer(pkScriptBuffer.length),
            pkScriptBuffer
        ]);
    };
}

function ScriptSig(params){

    var height = params.height,
        flags = params.flags,
        extraNoncePlaceholder = params.extraNoncePlaceholder;

    this.toBuffer = function(){

        return Buffer.concat([
            util.serializeNumber(height),
            new Buffer(flags, 'hex'),
            util.serializeNumber(Date.now() / 1000 | 0),
            new Buffer([extraNoncePlaceholder.length]),
            extraNoncePlaceholder,
            util.serializeString('/nodeStratum/')
        ]);
    }
};


var Generation = exports.Generation = function Generation(rpcData, publicKey, extraNoncePlaceholder){

    var tx = new Transaction({
        inputs: [new TransactionInput({
            prevOutIndex : Math.pow(2, 32) - 1,
            sigScript    : new ScriptSig({
                height                : rpcData.height,
                flags                 : rpcData.coinbaseaux.flags,
                extraNoncePlaceholder : extraNoncePlaceholder
            })
        })],
        outputs: [new TransactionOutput({
            value          : rpcData.coinbasevalue,
            pkScriptBuffer : publicKey
        })]
    });

    var txBuffer = tx.toBuffer();
    var epIndex  = buffertools.indexOf(txBuffer, extraNoncePlaceholder);
    var p1       = txBuffer.slice(0, epIndex);
    var p2       = txBuffer.slice(epIndex + extraNoncePlaceholder.length);

    this.transaction = tx;
    this.coinbase = [p1, p2];

};
*/


/*
     ^^^^ The above code was a bit slow. The below code is uglier but optimized.
 */



/*
This function creates the generation transaction that accepts the reward for
successfully mining a new block.
For some (probably outdated and incorrect) documentation about whats kinda going on here,
see: https://en.bitcoin.it/wiki/Protocol_specification#tx
 */

var createOutputTransaction = function(amount, payee, rewardToPool, reward, txOutputBuffers, payeeScript) {
	var payeeReward = amount;
    reward -= payeeReward;
    rewardToPool -= payeeReward;
	if(!payeeScript) {
    	payeeScript = util.addressToScript(payee);
	}
    txOutputBuffers.push(Buffer.concat([
        util.packInt64LE(payeeReward),
        util.varIntBuffer(payeeScript.length),
        payeeScript
    ]));
	return {reward, rewardToPool};
}

var generateOutputTransactions = function(poolRecipient, recipients, rpcData){

    var reward = rpcData.coinbasevalue;
    var rewardToPool = reward;

    var txOutputBuffers = [];



/* Dash 12.1 */
	if (rpcData.masternode) {
	    if (rpcData.masternode.payee) {
			var rewards = createOutputTransaction(rpcData.masternode.amount, rpcData.masternode.payee, rewardToPool, reward, txOutputBuffers)
	    	reward = rewards.reward;
			rewardToPool = rewards.rewardToPool;
		} else if (Array.isArray(rpcData.masternode)) {
			for(var i in rpcData.masternode) {
				var rewards = createOutputTransaction(rpcData.masternode[i].amount, rpcData.masternode[i].payee, rewardToPool, reward, txOutputBuffers)
				reward = rewards.reward;
				rewardToPool = rewards.rewardToPool;
			}
	    } 
	}
	
	if (rpcData.smartnode) {
	    if (rpcData.smartnode.payee) {
			var rewards = createOutputTransaction(rpcData.smartnode.amount, rpcData.smartnode.payee, rewardToPool, reward, txOutputBuffers)
	    	reward = rewards.reward;
			rewardToPool = rewards.rewardToPool;
		} else if (Array.isArray(rpcData.smartnode)) {
			for(var i in rpcData.smartnode) {
				var rewards = createOutputTransaction(rpcData.smartnode[i].amount, rpcData.smartnode[i].payee, rewardToPool, reward, txOutputBuffers)
				reward = rewards.reward;
				rewardToPool = rewards.rewardToPool;
			}
	    } 
	}

	if(rpcData.superblock) {
		for(var i in rpcData.superblock){
			var rewards = createOutputTransaction(rpcData.superblock[i].amount, rpcData.superblock[i].payee, rewardToPool, reward, txOutputBuffers)
	        reward = rewards.reward;
			rewardToPool = rewards.rewardToPool;
	    }
	}

	if (rpcData.payee) {
	    var payeeReward = 0;
	    if (rpcData.payee_amount) {
	        payeeReward = rpcData.payee_amount;
	    } else {
	        payeeReward = Math.ceil(reward / 5);
	    }
		var rewards = createOutputTransaction(payeeReward, rpcData.payee, rewardToPool, reward, txOutputBuffers)
		reward = rewards.reward;
		rewardToPool = rewards.rewardToPool;
    }

    if (rpcData.founder_payments_started && rpcData.founder) {
        var founderReward = rpcData.founder.amount || 0;
		var rewards = createOutputTransaction(founderReward, rpcData.founder.payee, rewardToPool, reward, txOutputBuffers)
		reward = rewards.reward;
		rewardToPool = rewards.rewardToPool;
    }

    for (var i = 0; i < recipients.length; i++){
        var recipientReward = Math.floor(recipients[i].percent * reward);
		var rewards = createOutputTransaction(recipientReward, null, rewardToPool, reward, txOutputBuffers, recipients[i].script)
        rewardToPool = rewards.rewardToPool;
    }
    createOutputTransaction(rewardToPool, null, rewardToPool, reward, txOutputBuffers, new Buffer(poolRecipient, "hex"));
    if (rpcData.default_witness_commitment !== undefined){
        witness_commitment = new Buffer(rpcData.default_witness_commitment, 'hex');
        txOutputBuffers.unshift(Buffer.concat([
            util.packInt64LE(0),
            util.varIntBuffer(witness_commitment.length),
            witness_commitment
        ]));
    }
    	return Buffer.concat([
		util.varIntBuffer(txOutputBuffers.length),
	        Buffer.concat(txOutputBuffers)
	    ]);

};


exports.CreateGeneration = function(rpcData, publicKey, extraNoncePlaceholder, reward, txMessages, recipients){
//console.log("publicKey %s\n", publicKey.toString('hex'));
    var txInputsCount = 1;
    var txOutputsCount = 1;
    var txVersion = txMessages === true ? 2 : 1;
    var txLockTime = 0;

    var txInPrevOutHash = "";
    var txInPrevOutIndex = Math.pow(2, 32) - 1;
    var txInSequence = 0;

    //Only required for POS coins
    var txTimestamp = reward === 'POS' ?
        util.packUInt32LE(rpcData.curtime) : new Buffer([]);

    //For coins that support/require transaction comments
    var txComment = txMessages === true ?
        util.serializeString('https://github.com/zone117x/node-stratum') :
        new Buffer([]);


    var scriptSigPart1 = Buffer.concat([
        util.serializeNumber(rpcData.height),
        new Buffer(rpcData.coinbaseaux.flags, 'hex'),
        util.serializeNumber(Date.now() / 1000 | 0),
        new Buffer([extraNoncePlaceholder.length])
    ]);

    var scriptSigPart2 = util.serializeString('/nodeStratum/');
	var coinbasePayload = rpcData.coinbase_payload;
	var coinbaseVersion = coinbasePayload ? Buffer.concat([util.packUInt16LE(3),util.packUInt16LE(5)]) : util.packUInt32LE(txVersion);
    var p1 = Buffer.concat([
        coinbaseVersion,
        txTimestamp,

        //transaction input
        util.varIntBuffer(txInputsCount),
        util.uint256BufferFromHash(txInPrevOutHash),
        util.packUInt32LE(txInPrevOutIndex),
        util.varIntBuffer(scriptSigPart1.length + extraNoncePlaceholder.length + scriptSigPart2.length),
        scriptSigPart1
    ]);


    /*
    The generation transaction must be split at the extranonce (which located in the transaction input
    scriptSig). Miners send us unique extranonces that we use to join the two parts in attempt to create
    a valid share and/or block.
     */


    var outputTransactions = generateOutputTransactions(publicKey, recipients, rpcData);
//	console.log("outputTransactions %s\n", outputTransactions.toString("hex"));

    var p2 = Buffer.concat([
        scriptSigPart2,
        util.packUInt32LE(txInSequence),
        //end transaction input

        //transaction output
        outputTransactions,
        //end transaction ouput

        util.packUInt32LE(txLockTime),
        txComment
    ]);
    if(coinbasePayload) {
	p2 = Buffer.concat([
		p2,
		util.varIntBuffer(coinbasePayload.length/2),
		new Buffer(coinbasePayload, 'hex')
	]) 
    }
    return [p1, p2];

};
