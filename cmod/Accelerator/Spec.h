/*
 * All rights reserved - Harvard University. 
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the "License"); 
 * you may not use this file except in compliance with the License.  
 * You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */


#ifndef __SPEC__
#define __SPEC__

#include <nvhls_int.h>
#include <nvhls_types.h>
#include <nvhls_vector.h>
#include <TypeToBits.h>
#include <connections/marshaller.h>

namespace spec {
 
  const int PE_INPUT_BITWIDTH = 32;
  const int PE_OUTPUT_BITWIDTH = 32;
  const int PE_ACCUMULATION_BITWIDTH = 64;

  const int N_PE = 16;


  const int kMem0Bitwidth = 32;
  const int kMem1Bitwidth = 32;
  const int kMem2Bitwidth = 32;
  const int kMemDepth = 1024;
  const int kMemAddrWidth = 10;

  typedef NVUINTW(PE_INPUT_BITWIDTH) VectorType;
  typedef NVUINTW(PE_ACCUMULATION_BITWIDTH) AccumVectorType;

  const int int16_vector_addr_bits = 1;
  const int int8_vector_addr_bits = 2;


}

#endif
