systemc_test:
	cd cmod/Accelerator/MainBuffer && make sim_clean && make sim_test && make run
	cd cmod/Accelerator/ProcessingElement && make sim_clean && make sim_test && make run
	cd cmod/Accelerator && make sim_clean && make sim_test && make run

clean:
	cd cmod/Accelerator/MainBuffer && make sim_clean
	cd cmod/Accelerator/ProcessingElement && make sim_clean
	cd cmod/Accelerator && make sim_clean

submission:
	zip ee271_fall2025_assignment4.zip cmod/Accelerator/Accelerator.h cmod/Accelerator/ProcessingElement/ProcessingElement.h cmod/Accelerator/MainBuffer/MainBuffer.h hls/Accelerator/Catapult/Accelerator.v1/concat_Accelerator.v

unzip:
	unzip ee271_fall2025_assignment4.zip
