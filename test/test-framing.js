/**
 * Test length-prefixed framing implementation
 * Tests message fragmentation, concatenation, and edge cases
 */

console.log('🧪 Testing Length-Prefixed Framing\n')

// Simulate the framing functions from wdk-worklet.js
let readBuffer = Buffer.alloc(0)

function writeFramed (data) {
  const length = Buffer.allocUnsafe(4)
  length.writeUInt32BE(data.length, 0)
  return Buffer.concat([length, data])
}

function processFramedData (chunk, onMessage) {
  const messages = []
  
  // Append new data to buffer
  readBuffer = Buffer.concat([readBuffer, chunk])

  // Try to extract complete messages
  while (readBuffer.length >= 4) {
    // Read message length from first 4 bytes
    const messageLength = readBuffer.readUInt32BE(0)

    // Check if we have the complete message
    const totalLength = 4 + messageLength
    if (readBuffer.length < totalLength) {
      // Not enough data yet, wait for more
      break
    }

    // Extract the message
    const messageData = readBuffer.slice(4, totalLength)
    readBuffer = readBuffer.slice(totalLength)

    messages.push(messageData)
  }
  
  return messages
}

// Test 1: Single complete message
console.log('Test 1: Single complete message')
{
  readBuffer = Buffer.alloc(0)
  const message = Buffer.from(JSON.stringify({ test: 'hello' }))
  const framed = writeFramed(message)
  
  const messages = processFramedData(framed)
  
  if (messages.length === 1 && messages[0].equals(message)) {
    console.log('  ✅ PASS: Single message processed correctly')
  } else {
    console.log('  ❌ FAIL: Expected 1 message, got', messages.length)
    process.exit(1)
  }
}

// Test 2: Multiple messages in one chunk
console.log('\nTest 2: Multiple messages in one chunk')
{
  readBuffer = Buffer.alloc(0)
  const msg1 = Buffer.from(JSON.stringify({ id: 1 }))
  const msg2 = Buffer.from(JSON.stringify({ id: 2 }))
  const msg3 = Buffer.from(JSON.stringify({ id: 3 }))
  
  // Concatenate multiple framed messages
  const chunk = Buffer.concat([
    writeFramed(msg1),
    writeFramed(msg2),
    writeFramed(msg3)
  ])
  
  const messages = processFramedData(chunk)
  
  if (messages.length === 3 &&
      messages[0].equals(msg1) &&
      messages[1].equals(msg2) &&
      messages[2].equals(msg3)) {
    console.log('  ✅ PASS: Three messages extracted correctly')
  } else {
    console.log('  ❌ FAIL: Expected 3 messages, got', messages.length)
    process.exit(1)
  }
}

// Test 3: Fragmented message (split across multiple chunks)
console.log('\nTest 3: Fragmented message (split across chunks)')
{
  readBuffer = Buffer.alloc(0)
  const message = Buffer.from(JSON.stringify({ 
    large: 'x'.repeat(1000) 
  }))
  const framed = writeFramed(message)
  
  // Split into multiple chunks
  const chunk1 = framed.slice(0, 100)
  const chunk2 = framed.slice(100, 500)
  const chunk3 = framed.slice(500)
  
  let messages = []
  messages.push(...processFramedData(chunk1))
  messages.push(...processFramedData(chunk2))
  messages.push(...processFramedData(chunk3))
  
  if (messages.length === 1 && messages[0].equals(message)) {
    console.log('  ✅ PASS: Fragmented message reassembled correctly')
  } else {
    console.log('  ❌ FAIL: Fragmentation handling failed')
    process.exit(1)
  }
}

// Test 4: Partial header (length header split)
console.log('\nTest 4: Partial header (length header split)')
{
  readBuffer = Buffer.alloc(0)
  const message = Buffer.from(JSON.stringify({ test: 'partial' }))
  const framed = writeFramed(message)
  
  // Split in the middle of the length header
  const chunk1 = framed.slice(0, 2)  // First 2 bytes of length
  const chunk2 = framed.slice(2)     // Rest of message
  
  let messages = []
  messages.push(...processFramedData(chunk1))  // Should buffer, no message yet
  messages.push(...processFramedData(chunk2))  // Should complete the message
  
  if (messages.length === 1 && messages[0].equals(message)) {
    console.log('  ✅ PASS: Partial header handled correctly')
  } else {
    console.log('  ❌ FAIL: Partial header handling failed')
    process.exit(1)
  }
}

// Test 5: Empty message
console.log('\nTest 5: Empty message')
{
  readBuffer = Buffer.alloc(0)
  const message = Buffer.from('')
  const framed = writeFramed(message)
  
  const messages = processFramedData(framed)
  
  if (messages.length === 1 && messages[0].equals(message)) {
    console.log('  ✅ PASS: Empty message handled correctly')
  } else {
    console.log('  ❌ FAIL: Empty message handling failed')
    process.exit(1)
  }
}

// Test 6: Large message (test UInt32 size handling)
console.log('\nTest 6: Large message (1MB)')
{
  readBuffer = Buffer.alloc(0)
  const message = Buffer.alloc(1024 * 1024, 'A')  // 1MB
  const framed = writeFramed(message)
  
  const messages = processFramedData(framed)
  
  if (messages.length === 1 && messages[0].equals(message)) {
    console.log('  ✅ PASS: Large message (1MB) handled correctly')
  } else {
    console.log('  ❌ FAIL: Large message handling failed')
    process.exit(1)
  }
}

// Test 7: Real JSON-RPC messages
console.log('\nTest 7: Real JSON-RPC messages')
{
  readBuffer = Buffer.alloc(0)
  
  const request = {
    jsonrpc: '2.0',
    id: 1,
    method: 'getAddress',
    params: { network: 'ethereum', accountIndex: 0 }
  }
  
  const response = {
    jsonrpc: '2.0',
    id: 1,
    result: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb27'
  }
  
  const reqBuf = Buffer.from(JSON.stringify(request))
  const resBuf = Buffer.from(JSON.stringify(response))
  
  // Send both messages
  const chunk = Buffer.concat([writeFramed(reqBuf), writeFramed(resBuf)])
  const messages = processFramedData(chunk)
  
  if (messages.length === 2) {
    const parsedReq = JSON.parse(messages[0].toString())
    const parsedRes = JSON.parse(messages[1].toString())
    
    if (parsedReq.method === 'getAddress' && parsedRes.result.startsWith('0x')) {
      console.log('  ✅ PASS: Real JSON-RPC messages handled correctly')
    } else {
      console.log('  ❌ FAIL: JSON-RPC parsing failed')
      process.exit(1)
    }
  } else {
    console.log('  ❌ FAIL: Expected 2 messages, got', messages.length)
    process.exit(1)
  }
}

console.log('\n✨ All framing tests passed!\n')
