# Assignment 4 - Designing SIMD Accelerator Using Catapult HLS (Optional Assignment for Extra Credit)

In this optional assignment, you will try an alternative approach to hardware design. You will reimplement the SIMD accelerator in HLS. This assignment will introduce you to high-level synthesis using the Catapult HLS tool. HLS takes in behavioral C++ code and generates RTL. This allows for higher productivity in design as well as verification. You will be exposed to the advantages and drawbacks of HLS by reimplementing the SIMD accelerator in HLS and verifying the functionality. The appendix attached gives insight into HLS syntax and common coding / debugging practices.

# Setup Steps
1. From a farmshare terminal (not caddy) run the following command: `/farmshare/home/classes/ee/admin/software/bin/rhel8.sh`
2. Clone the following repository: git@code.stanford.edu:EE271/simd-part4.git
3. Navigate to the repository's top directory and source setup.csh: `cd simd-part4; source setup.csh`

# Directory Structure
- `cmod/`: Contains the C++/SystemC source code for the accelerator modules and their unit testbenches.
  - `Accelerator/`: Top-level accelerator module and its associated files.
    - `Accelerator.h`: Definition of the main Accelerator module.
    - `InstructionSpec.h`: Defines the instruction set architecture (ISA).
    - `Spec.h`: Defines constants and common types.
    - `testbench.cpp`: Integration testbench for the Accelerator module.
    - `MainBuffer/`: Memory buffer module and its unit test.
      - `MainBuffer.h`: Definition of the MainBuffer module.
      - `testbench.cpp`: Unit testbench for the MainBuffer.
    - `ProcessingElement/`: Processing element module and its unit test.
      - `ProcessingElement.h`: Definition of the ProcessingElement module.
      - `testbench.cpp`: Unit testbench for the ProcessingElement.
- `hls/`: Contains HLS-related scripts and output.
  - `Accelerator/`: HLS project files for the Accelerator.

# Module Description

## Main Buffer
Manages memory operations for the accelerator, including reading/writing matrix and vector data. It provides port-based interfaces for instruction handling. It has the same interfaces as the Verilog. While the Verilog implementation of the matrix memory had a bandwidth of 32*16 bits, here we will access 16 consecutive locations for one memory access to populate the matrix output. There are some additional ports like `matrix_mem_write*`, `vector_mem_write*` and `output_mem_read`, which are only used to aid the testbench in reading and writing memories for initial loading and final answer checking. Here, the `vector_data` is being broadcast by being replicated across the output array.

## Processing Element
Performs core computational tasks (e.g., MAC, PASS, CLR, RND operations) on vector and matrix data as directed by instructions. The ProcessingElement interface and opcodes are the same as before, and it is instantiated 16 times at the top level.

## Accelerator
The top-level module, integrating multiple Processing Elements and a Main Buffer to form the SIMD accelerator. It orchestrates instruction flow and data movement between sub-modules.

# Your Turn

Your task is to add the necessary code to the following files (filling in the TODOs):
- `cmod/Accelerator/MainBuffer/MainBuffer.h`
- `cmod/Accelerator/ProcessingElement/ProcessingElement.h`
- `cmod/Accelerator/Accelerator.h`

After implementing the changes, test each module by navigating to its directory and running the following command:
```bash
make clean; make sim_test; ./sim_test
```
For example, to test the `MainBuffer` module:
```bash
cd cmod/Accelerator/MainBuffer
make clean; make sim_test; ./sim_test
```

Now, we will generate the RTL using HLS and run a RTL simulation:
- Navigate to `hls/Accelerator/` and run `make hls`. It will take approximately 30 minutes.
- Run the RTL simulation in vcs `make vcs`
- Open the waveform:
```bash
verdi -ssf default.fsdb -dbdir Catapult/Accelerator.v1/scverify/concat_sim_Accelerator_v_vcs/sc_main.daidir/
```
and load the signal.rc present in the same path (in the waveform window navigate to File -> Restore Signal -> select signal.rc). Observe the ready valid interface for the MainBuffer and PorceessingElement interface signals. 

# Submission

Due Tuesday, December 1, 2026, 11:59 PM PST.
1. Run `make submission` in the top repository directory and submit the generated zip file.
2. Submit a write-up with the following:
  - Screenshot of ProcessingElement unit test passing
  - Screenshot of MainBuffer unit test passing
  - Screenshot of Accelerator test passing
  - Screenshot of RTL simulation passing after `make vcs` command
  - Screenshot of the RTL simulation waveform
  - Add a brief note about notable differences between designing in SystemC and Verilog. How is control different? Which is easier to debug? Which might be more performant / has more area?

# Appendix

## `Connections` Library: `Push`/`Pop` and Blocking vs. Non-Blocking

This project utilizes the `Connections` library, a component of Catapult HLS, to model communication between hardware modules. Understanding its `Push` and `Pop` mechanisms is crucial.

### Blocking Calls: `Push()` and `Pop()`

-   **`Push(data)`**: This is a **blocking** write. The simulation will not advance past this call until the receiving module is ready to accept the data. In hardware, this corresponds to a valid/ready handshake, where the sending module asserts a `valid` signal and waits for the receiving module to assert a `ready` signal.

-   **`Pop()`**: This is a **blocking** read. The simulation will not advance past this call until there is new data available from the sending module. It waits for the `valid` signal to be asserted by the sender.

Blocking calls are useful for modeling synchronous data transfers where sender and receiver must wait for each other. They simplify the control logic in C++ but can lead to simulation deadlocks if one side is waiting for a condition that never occurs.

### Non-Blocking Calls: `PopNB(data)`

-   **`PopNB(data)`**: This is a **non-blocking** read. It attempts to read data from the channel *without* waiting.
    -   It returns `true` if the read was successful (i.e., new data was available).
    -   It returns `false` if no new data was available.

Non-blocking calls are used when a module needs to perform other work while waiting for data or when it needs to poll multiple sources.

### `#pragma hls_unroll yes`

This pragma is used on loops. When a loop is **unrolled**, the synthesizer creates multiple copies of the hardware corresponding to the loop body, instead of creating a single hardware block that is reused for each iteration.

-   **Effect**: It can significantly improve performance (throughput) by allowing multiple iterations of the loop to execute in parallel.
-   **Cost**: It increases the hardware area, as it duplicates the logic for each iteration.
-   **Usage**: It is typically used on small loops where the iterations are independent and can be executed simultaneously. For example, loops that iterate over the `N_PE` (Number of Processing Elements) are unrolled in this project to create parallel hardware for each PE.

## Debugging

Debugging SystemC and HLS designs can be done using standard C++ debugging techniques. A common and straightforward method is to use standard output streams:

-   **`std::cout`**: Insert `std::cout` statements into your C++/SystemC code to print values of variables, progress through code paths, or indicate specific events. These statements will be printed to the console during simulation, providing visibility into the design's behavior. This is particularly useful for verifying logic, understanding data flow, and pinpointing unexpected behavior during the early stages of development.
