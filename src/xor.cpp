/*!
 * Buffer xor module
 * Copyright (c) Agora S.A.
 * Licensed under the MIT License.
 * Version: 1.0
 */

#include <v8.h>
#include <node.h>
#include <node_buffer.h>
#include <cstring>
 
using namespace node;
using namespace v8;

namespace {

	Handle<Value> _xor(Handle<Object>& buffer, void* pattern, size_t size, size_t maskOffset) {
		size_t length = Buffer::Length(buffer);
		uint8_t* data = (uint8_t*) Buffer::Data(buffer);
	
		maskOffset &= 3;
		
		uint8_t mask[4];
		memcpy(mask, (uint8_t*)pattern + maskOffset, 4 - maskOffset);
		if (maskOffset > 0)
			memcpy(mask + 4 - maskOffset, pattern, maskOffset);
		
		uint32_t* pos32 = (uint32_t*)data;
		uint32_t* end32 = pos32 + (int)(length >> 2);
		uint32_t* mask32 = (uint32_t*)mask;
		
		while (pos32 < end32) {
			*(pos32++) ^= *mask32;
		}

		uint8_t* pos8 = (uint8_t*)pos32;
		uint8_t* end8 = data + length;
		uint8_t* mask8 = mask;
		
		while (pos8 < end8) {
			*(pos8++) ^= *(mask8++);
		}
	
		return Integer::NewFromUnsigned((mask8 - mask + maskOffset) & 3);
	}

	Handle<Value> _xorInt(Handle<Object>& buffer, int c, size_t maskOffset) {
		return _xor(buffer, &c, sizeof(c), maskOffset);
	}

	#define XOR_BUFFER_THROW_EXCEPTION(name, msg) { \
		static Persistent<String> name = Persistent<String>::New(String::New(msg)); \
		return ThrowException(Exception::TypeError(name)); }
	
	static Handle<Value> xorBuffer(const Arguments &args)
	{
		if (args.Length() < 2) XOR_BUFFER_THROW_EXCEPTION(illegalArgumentCountException, "Expected 2 arguments")
		
		if (!Buffer::HasInstance(args[0])) XOR_BUFFER_THROW_EXCEPTION(illegalFirstArgumentException, "First argument must be a Buffer")
		
		Handle<Object> buffer = args[0]->ToObject();
		
		size_t maskOffset = 0;
		if (args.Length() == 3) {
			if (!args[2]->IsInt32())
                XOR_BUFFER_THROW_EXCEPTION(illegalThirdArgumentException, "Third argument must be a number")
                
			maskOffset = args[2]->ToInt32()->Int32Value();
		}
		
		if (args[1]->IsInt32()) {
			int c = args[1]->ToInt32()->Int32Value();
			return _xorInt(buffer, c, maskOffset);
			
		} else if (args[1]->IsString()) {
			String::Utf8Value s(args[1]->ToString());
			if (s.length() != 4) XOR_BUFFER_THROW_EXCEPTION(illegalStringArgumentException, "Second argument must be a 4 character string")
			return _xor(buffer, *s, s.length(), maskOffset);
		
		} else if (Buffer::HasInstance(args[1])) {
			Handle<Object> other = args[1]->ToObject();
			size_t length = Buffer::Length(other);
			uint8_t* data = (uint8_t*) Buffer::Data(other);
			if (length != 4) XOR_BUFFER_THROW_EXCEPTION(illegalStringArgumentException, "Second argument must be a 4 bytes Buffer")
			return _xor(buffer, data, length, maskOffset);
		}
	
		XOR_BUFFER_THROW_EXCEPTION(illegalArgumentException, "Second argument should be either a string, a buffer or an integer.")
	}
	
	
	void RegisterModule(Handle<Object> target) {
		NODE_SET_METHOD(target, "xor", xorBuffer);
	}

}

NODE_MODULE(xor, RegisterModule);
