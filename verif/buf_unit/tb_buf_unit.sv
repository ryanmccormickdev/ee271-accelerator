`timescale 1ns / 1ps
`include "defines.sv"

// Buffer unit test: drives buffer directly (no controller) from vectors.txt, one cycle per line, and logs
// matrix_data / vector_data after every clock edge into observed.txt; at the end it dumps MEM2 to mem2.bits.
// check.py compares both with the staff's MainBuffer model and reports the read and write latencies it sees.
// Uses the instance names the staff testbenches already require: u_matrix_mem, u_vector_mem, u_output_mem.
module tb_buf_unit;
    logic clk = 1'b0;
    logic rst_n = 1'b0;
    buf_inst_t buf_inst;
    logic buf_inst_valid;
    logic [`MEM0_BITWIDTH-1:0] matrix_data;
    logic [`MEM1_BITWIDTH-1:0] vector_data;
    logic [`MEM2_BITWIDTH-1:0] output_data;

    buffer dut (
        .clk(clk), .rst_n(rst_n),
        .buf_inst(buf_inst), .buf_inst_valid(buf_inst_valid),
        .matrix_data(matrix_data), .vector_data(vector_data), .output_data(output_data)
    );

    always #5 clk = ~clk;

    integer fin, fout, n, idle;
    logic [31:0] f_valid, f_op, f_mode, f_a, f_b;
    logic [`MEM2_BITWIDTH-1:0] f_out;

    initial begin
        dut.u_matrix_mem.loadmem("mem0.bits");
        dut.u_vector_mem.loadmem("mem1.bits");
        fin = $fopen("vectors.txt", "r");
        if (fin == 0) $fatal(1, "cannot open vectors.txt");
        fout = $fopen("observed.txt", "w");
        if ($test$plusargs("DUMP")) begin $dumpfile("waves.vcd"); $dumpvars(0, tb_buf_unit); end
        buf_inst = '0; buf_inst_valid = 1'b0; output_data = '0;
        repeat (3) @(negedge clk);
        rst_n = 1'b1;
        idle = 0;
        forever begin
            @(negedge clk);
            n = $fscanf(fin, "%h %h %h %h %h %h\n", f_valid, f_op, f_mode, f_a, f_b, f_out);
            if (n == 6) begin
                buf_inst_valid       = f_valid[0];
                buf_inst.opcode      = f_op[`BUF_OPCODE_BITWIDTH-1:0];
                buf_inst.mode        = f_mode[`BUF_MODE_BITWIDTH-1:0];
                buf_inst.mema_offset = f_a[`BUF_MEMA_OFFSET_BITWIDTH-1:0];
                buf_inst.memb_offset = f_b[`BUF_MEMB_OFFSET_BITWIDTH-1:0];
                output_data          = f_out;
            end else begin
                buf_inst_valid = 1'b0; buf_inst = '0;
                idle = idle + 1;
                if (idle > 6) break;
            end
            // Sample just before the rising edge that would consume the data (a PE latches it there), i.e. AFTER
            // the next instruction has been applied: data for a READ must survive whatever comes next on buf_inst.
            #4;
            $fdisplay(fout, "%h %h", matrix_data, vector_data);
        end
        dut.u_output_mem.dumpmem("mem2.bits");
        $fclose(fout);
        $finish;
    end
endmodule
