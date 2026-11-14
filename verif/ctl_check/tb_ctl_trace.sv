`timescale 1ns / 1ps
`include "defines.sv"

// Controller check: runs the staff's top_controller wrapper (instruction_memory + our controller, see
// part2/unoptimized_verilog/validation/testbenches/top_controller.sv) on a program and logs, once per cycle
// (at the falling edge, when everything is stable), what the controller presents to the buffer and the PEs.
// check.py compares that log with the program expanded repetition by repetition.
module tb_ctl_trace;
    reg clk = 1'b0;
    reg rst_n = 1'b0;
    reg [`IMEM_ADDR_WIDTH-1:0] instruction_count;
    string inst_file, trace_file;
    integer fd, cyc, after;

    top_controller dut (.clk(clk), .rst_n(rst_n), .instruction_count(instruction_count));

    always #5 clk = ~clk;

    initial begin
        if (!$value$plusargs("INST_COUNT=%d", instruction_count)) $fatal(1, "+INST_COUNT missing");
        if (!$value$plusargs("INST_FILE=%s", inst_file)) $fatal(1, "+INST_FILE missing");
        if (!$value$plusargs("TRACE=%s", trace_file)) trace_file = "trace.txt";
        dut.u_instruction_memory.u_instruction_memory.loadmem(inst_file);
        if ($test$plusargs("DUMP")) begin $dumpfile("waves.vcd"); $dumpvars(0, tb_ctl_trace); end
        fd = $fopen(trace_file, "w");
        $fdisplay(fd, "# cycle buf_valid buf_op buf_mode mema memb pe_valid pe_op pe_mode pe_value exec_begins pc");
        #46 rst_n = 1'b1;   // ~5 reset cycles like the staff benches, released just after a rising edge so the
                              // first logged cycle (falling edge at t=50) already sees the first fetch
        cyc = 0; after = -1;
        forever begin
            @(negedge clk);
            $fdisplay(fd, "%0d %0d %0d %0d %0d %0d %0d %0d %0d %0d %0d %0d", cyc,
                      dut.buf_inst_valid, dut.buf_inst.opcode, dut.buf_inst.mode, dut.buf_inst.mema_offset,
                      dut.buf_inst.memb_offset, dut.pe_inst_valid, dut.pe_inst.opcode, dut.pe_inst.mode,
                      dut.pe_inst.value, dut.inst_exec_begins, dut.u_instruction_memory.program_counter);
            cyc = cyc + 1;
            // the staff benches' end condition, then a few more cycles so a late valid would still be seen
            if (after < 0 && dut.u_instruction_memory.program_counter == instruction_count
                && dut.pe_inst_valid !== 1'b1 && dut.buf_inst_valid !== 1'b1) after = 0;
            if (after >= 0) after = after + 1;
            if (after > 4 || cyc > 20000) break;
        end
        if (cyc > 20000) $display("TIMEOUT: the program never finished (20000 cycles)");
        $fclose(fd);
        $finish;
    end
endmodule
