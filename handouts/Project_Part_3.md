# EE271 SIMD Accelerator: Assignment #3 (text transcription)

> Transcribed from `Project_Part_3.pdf` on Canvas (uploaded Fri Nov 13 2026, 5:16 PM; updated Sat Nov 14, 12:59 AM):
> https://canvas.stanford.edu/courses/232707/files/17974608. The PDF is the authority. This copy exists so the text
> can be searched with grep. Formatting is ours; wording is the handout's.

## 1 Introduction

For the EE271 class project, you will be working on a Single Instruction Multiple Data (SIMD) accelerator for matrix
multiplication. This project is segmented into three components. In the first component you will complete a Python
simulator of the accelerator. In the second component of the project you will complete an RTL implementation of the
accelerator using the lessons learned from completing the Python simulator and synthesize your RTL implementation in
order to determine its power performance and area (PPA). In the third component of the project you will optimize your
RTL implementation in order to improve its PPA.

This document will focus on the details/instructions needed to complete the third component of the project, which we
have labeled Assignment #3. **Please read the entirety of this document prior to starting the assignment.** If you need
a refresher on how to setup your environment or the overall structure of the accelerator, please refer to the previous
assignment. Section 2 will cover what needs to be done to finish the assignment as well as how to submit the assignment
once your implementation is complete.

## 2 Assignment #3

For the 3rd assignment of the EE271 class project you will be working on optimizing your System Verilog code from part
2 in order to improve power, performance and area. (PPA) In order to determine the effect any given optimization has on
the PPA of your design we will be using a figure of merit. (FoM) As you implement different optimizations you will be
calculating your FoM in order to determine how each optimization affects the quality of your design.

### 2.1 What is a Figure of Merit (FoM)

When optimizing a design there is often an adverse relationship between power, performance, and area. For example, in
a CPU you can often increase performance by increasing the number of cores. As additional cores allow you to perform
more computation in the same amount of time. However, increasing the number of cores also increases the power and the
area of the design. These relationships between performance power and area make it difficult to determine if an
optimization improved the overall quality of your design. In order to fix this issue we create a formula which takes in
the power, performance, and area of your design and gives you a number, this number is your figure of merit (FoM). For
this project your figure of merit is the following:

```
FoM = (Time_int8 + Time_int16 + Time_int32)^2.3 · (Area (µm²)) · (Power (mW)) · 10^-15
```

Where `Time_int8` is the amount of time it takes your design to complete the int8 test equivalence test in
nanoseconds. This can be computed by multiplying the number of clock cycles it takes to complete the test by your clock
period. This pattern holds for `Time_int16` and `Time_int32` as well. **You must be able to actually synthesize your
design at the clock period you use in your calculations without any timing violations.**

In part 3 of the project your goal is to minimize the FoM of your design.

### 2.2 Optimization Approaches

#### 2.2.1 Hardware Reuse

Hardware reuse is the concept of using a single hardware block to perform multiple different functions. In our SIMD
processor the typical design is to use 4 8-bit multipliers, 2 16-bit multipliers, and 1 32-bit multiplier to handle
each of the three computation modes. Given that only one mode is used a time it is possible to reduce the number of
multipliers in the design by reusing the larger multipliers to perform the computations required by the smaller
operating modes. While the exact details of how this can be achieved will be left as an exercise to the reader, note
that it is possible to use a total of 4 or less multipliers.

#### 2.2.2 Register Re-timing

Register re-timing works to optimize timing by trying to equalize the logic delay between different stages in a
pipeline by rearranging the ordering of combinational logic within the pipeline. Using this technique you can simply
instantiate a series of registers and allow the synthesis tool to optimize them rather than manually pipelining the
design.

In order to allow the synthesis tool to utilize register re-timing techniques, simply pass the `-retime` flag to
`compile_ultra` in the `dc_synth.tcl` file. (`compile_ultra -retime`)

#### 2.2.3 Timing Optimization

While register re-timing is very powerful, it is not always capable of fixing all timing violations. In order to
improve your timing beyond what register re-timing can provide, sometimes a more manual approach is required. The
general timing optimization loop is as follows. First synthesize the design. Secondly, check the timing report and
identify any violating paths. Third, manually place registers along those paths to break up the timing. Finally, repeat
until the desired timing performance is achieved. The downside of this approach is the significant amount of manual
effort involved.

#### 2.2.4 Clock Gating

One approach to improve the power consumption of your design is to perform clock gating. Clock gating is the process of
using an enable signal to control whether the clock signal is passed to the registers within a design. By preventing
the clock from reaching registers which are not in use, significant power savings can be extracted.

Fortunately, Synopsys Design Compiler is capable of automatically clock gating a design. There are many resources
available which explain this process. As such, we will leave the exact steps to perform this optimization as an
exercise for the reader.

#### 2.2.5 Design Sizing

As discussed in earlier assignments, one advantage of using a SIMD style accelerator is the ability to easily scale the
number of processing elements. A large part of your optimizations will focus around finding the correct balance of PEs
such that you get a large increase in performance while keeping the area of the design within the **1,000,000 µm²
maximum**.

In order to modify the number of PEs you will need to modify how the equivalence tests are compiled and executed.
Recall that the parameter which controls the number of PEs is set in the `defines.sv` file which is generated by the
`ivd-gv` tool. In order to change the number of PEs, simply pass the `--pe_count NUM_OF_PES` flag to the tool.
(`ivd-gv --pe_count NUM_OF_PES`) In order for this change to propagate to the equivalence tests you must modify the
Makefile to pass the `--pe_count NUM_OF_PES` parameter to each of the tools which require it. (`ivd-gv`, `ivd-cc`, and
`ivd-sim`)

#### 2.2.6 Anything Else You Can Imagine

Please feel free to explore optimization approaches and strategies beyond what we have enumerated here.

### 2.3 Submission

Your submission will consist of a report in which you document the following:

1. A short description of each optimization you performed.
2. How that optimization changed your FoM. (Percentage Improvement)
3. A short reflection about why you think the optimization had the observed change.
4. Your final FoM.
5. A 1-page reflection on your use of AI tools throughout this project.

**Submit to Gradescope by Friday, Dec 4, 2026, 11:59 PM PST.**
