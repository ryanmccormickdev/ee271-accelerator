`timescale 1ns / 1ps
`include "defines.sv"

// PE unit test: drives processing_element directly (no controller, no buffer) from vectors.txt and logs what
// vector_output shows after every clock edge into observed.txt. check.py compares that with the staff reference.
//
// The PE's interface contract that this assumes: an instruction (plus its vector/matrix operands) is presented
// during one cycle; the PE acts on it at that cycle's rising edge; the result is visible on vector_output after
// that edge. check.py also accepts a constant extra latency (a pipelined PE in Part 3) and reports what it found.
//
// Optional: +define+ACC_PATH=<signal inside the PE>, e.g. +define+ACC_PATH=acc, also logs and checks the accumulator.
module tb_pe_unit;
    logic clk = 1'b0;
    logic rst_n = 1'b0;
    pe_inst_t pe_inst;
    logic pe_inst_valid;
    logic [`PE_INPUT_BITWIDTH-1:0]  vector_input, matrix_input;
    logic [`PE_OUTPUT_BITWIDTH-1:0] vector_output;

    processing_element dut (
        .clk(clk), .rst_n(rst_n),
        .pe_inst(pe_inst), .pe_inst_valid(pe_inst_valid),
        .vector_input(vector_input), .matrix_input(matrix_input),
        .vector_output(vector_output)
    );

    always #5 clk = ~clk;

    integer fin, fout, n, idle;
    string vfile, ofile;
    logic [31:0] f_valid, f_op, f_mode, f_val, f_a, f_b;

    initial begin
        if (!$value$plusargs("VECTORS=%s", vfile)) vfile = "vectors.txt";
        if (!$value$plusargs("OBSERVED=%s", ofile)) ofile = "observed.txt";
        fin = $fopen(vfile, "r");
        if (fin == 0) $fatal(1, "cannot open %s", vfile);
        fout = $fopen(ofile, "w");
        pe_inst = '0; pe_inst_valid = 1'b0; vector_input = '0; matrix_input = '0;
        if ($test$plusargs("DUMP")) begin $dumpfile("waves.vcd"); $dumpvars(0, tb_pe_unit); end
        repeat (3) @(negedge clk);
        rst_n = 1'b1;
        idle = 0;
        forever begin
            @(negedge clk);
`ifdef ACC_PATH
            $fdisplay(fout, "%h %h", vector_output, dut.`ACC_PATH);
`else
            $fdisplay(fout, "%h", vector_output);
`endif
            n = $fscanf(fin, "%h %h %h %h %h %h\n", f_valid, f_op, f_mode, f_val, f_a, f_b);
            if (n == 6) begin
                pe_inst_valid = f_valid[0];
                pe_inst.opcode = f_op[`PE_OPCODE_BITWIDTH-1:0];
                pe_inst.mode   = f_mode[`PE_MODE_BITWIDTH-1:0];
                pe_inst.value  = f_val[`PE_VALUE_BITWIDTH-1:0];
                vector_input   = f_a;
                matrix_input   = f_b;
            end else begin
                // after the last vector: NOPs with valid low, so a pipelined PE can drain
                pe_inst_valid = 1'b0; pe_inst = '0; vector_input = '0; matrix_input = '0;
                idle = idle + 1;
                if (idle > 8) break;
            end
        end
        $fclose(fout);
        $finish;
    end
endmodule
